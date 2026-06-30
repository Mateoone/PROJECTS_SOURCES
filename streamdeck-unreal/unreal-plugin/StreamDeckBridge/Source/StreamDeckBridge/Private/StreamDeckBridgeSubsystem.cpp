// Copyright MIP. POC Stream Deck <-> Unreal bridge.

#include "StreamDeckBridgeSubsystem.h"

#include "Async/Async.h"
#include "Common/TcpSocketBuilder.h"
#include "Dom/JsonObject.h"
#include "HAL/RunnableThread.h"
#include "Serialization/JsonReader.h"
#include "Serialization/JsonSerializer.h"
#include "Sockets.h"
#include "SocketSubsystem.h"

DEFINE_LOG_CATEGORY_STATIC(LogStreamDeckBridge, Log, All);

/**
 * Single background thread that:
 *   - opens a listening TCP socket,
 *   - accepts one Stream Deck client at a time,
 *   - reads newline-delimited UTF-8 JSON and forwards each line to the subsystem,
 *   - lets the game thread push state back through Send().
 */
class FStreamDeckServerWorker : public FRunnable
{
public:
	FStreamDeckServerWorker(UStreamDeckBridgeSubsystem* InOwner, int32 InPort)
		: Owner(InOwner)
		, Port(InPort)
	{
		Thread = FRunnableThread::Create(this, TEXT("StreamDeckServerWorker"), 0, TPri_BelowNormal);
	}

	virtual ~FStreamDeckServerWorker() override
	{
		Stop();
		if (Thread)
		{
			Thread->WaitForCompletion();
			delete Thread;
			Thread = nullptr;
		}
		CloseClient();
		CloseListen();
	}

	virtual bool Init() override { return true; }

	virtual uint32 Run() override
	{
		ISocketSubsystem* SocketSub = ISocketSubsystem::Get(PLATFORM_SOCKETSUBSYSTEM);
		if (!SocketSub)
		{
			return 1;
		}

		ListenSocket = FTcpSocketBuilder(TEXT("StreamDeckListen"))
			.AsReusable()
			.BoundToEndpoint(FIPv4Endpoint(FIPv4Address::Any, Port))
			.Listening(8)
			.WithReceiveBufferSize(64 * 1024);

		if (!ListenSocket)
		{
			UE_LOG(LogStreamDeckBridge, Error, TEXT("Could not bind TCP listener on port %d"), Port);
			return 1;
		}

		UE_LOG(LogStreamDeckBridge, Log, TEXT("Stream Deck bridge listening on 0.0.0.0:%d"), Port);

		TArray<uint8> RecvBuffer;
		RecvBuffer.SetNumUninitialized(64 * 1024);

		while (bRunning)
		{
			// Accept a client if we don't have one.
			if (!ClientSocket)
			{
				bool bPending = false;
				if (ListenSocket->HasPendingConnection(bPending) && bPending)
				{
					TSharedRef<FInternetAddr> Addr = SocketSub->CreateInternetAddr();
					FSocket* Accepted = ListenSocket->Accept(*Addr, TEXT("StreamDeckClient"));
					if (Accepted)
					{
						FScopeLock Lock(&ClientCS);
						ClientSocket = Accepted;
						ByteBuffer.Reset();
						UE_LOG(LogStreamDeckBridge, Log, TEXT("Stream Deck client connected: %s"), *Addr->ToString(true));
					}
				}
				else
				{
					FPlatformProcess::Sleep(0.02f);
					continue;
				}
			}

			// Drain whatever the client sent.
			uint32 PendingSize = 0;
			bool bGotData = false;
			while (ClientSocket && ClientSocket->HasPendingData(PendingSize))
			{
				const int32 ToRead = FMath::Min<int32>(PendingSize, RecvBuffer.Num());
				int32 Read = 0;
				if (ClientSocket->Recv(RecvBuffer.GetData(), ToRead, Read) && Read > 0)
				{
					bGotData = true;
					AppendAndDispatch(RecvBuffer.GetData(), Read);
				}
				else if (Read == 0)
				{
					// Graceful close from the peer.
					CloseClient();
					break;
				}
				else
				{
					break;
				}
			}

			// Detect a closed connection (peer disconnected).
			if (ClientSocket)
			{
				uint32 Dummy = 0;
				const ESocketConnectionState State = ClientSocket->GetConnectionState();
				if (State == SCS_ConnectionError || (!bGotData && !ClientSocket->HasPendingData(Dummy) && !IsConnectionAlive()))
				{
					UE_LOG(LogStreamDeckBridge, Log, TEXT("Stream Deck client disconnected"));
					CloseClient();
				}
			}

			FPlatformProcess::Sleep(0.01f);
		}

		return 0;
	}

	virtual void Stop() override { bRunning = false; }

	/** Thread-safe send of one already-formatted line (must end with '\n'). */
	bool Send(const FString& Line)
	{
		FScopeLock Lock(&ClientCS);
		if (!ClientSocket)
		{
			return false;
		}
		FTCHARToUTF8 Utf8(*Line);
		int32 Sent = 0;
		return ClientSocket->Send(reinterpret_cast<const uint8*>(Utf8.Get()), Utf8.Length(), Sent) && Sent == Utf8.Length();
	}

	bool HasClient() const { return ClientSocket != nullptr; }

private:
	bool IsConnectionAlive() const
	{
		// Lightweight heuristic: a closed peer usually flips state to SCS_NotConnected.
		return ClientSocket && ClientSocket->GetConnectionState() != SCS_NotConnected;
	}

	void AppendAndDispatch(const uint8* Data, int32 Len)
	{
		ByteBuffer.Append(Data, Len);

		// Split the raw UTF-8 byte stream on '\n', decode each complete line.
		int32 Start = 0;
		for (int32 i = 0; i < ByteBuffer.Num(); ++i)
		{
			if (ByteBuffer[i] == '\n')
			{
				int32 LineLen = i - Start;
				// Strip a trailing '\r' (CRLF tolerance).
				if (LineLen > 0 && ByteBuffer[Start + LineLen - 1] == '\r')
				{
					--LineLen;
				}
				if (LineLen > 0 && Owner)
				{
					FUTF8ToTCHAR Converted(reinterpret_cast<const ANSICHAR*>(ByteBuffer.GetData() + Start), LineLen);
					const FString Line = FString(Converted.Length(), Converted.Get()).TrimStartAndEnd();
					if (!Line.IsEmpty())
					{
						Owner->HandleIncomingLine(Line);
					}
				}
				Start = i + 1;
			}
		}

		// Keep the unfinished tail for next time.
		if (Start > 0)
		{
			ByteBuffer.RemoveAt(0, Start, EAllowShrinking::No);
		}
	}

	void CloseClient()
	{
		FScopeLock Lock(&ClientCS);
		if (ClientSocket)
		{
			ClientSocket->Close();
			ISocketSubsystem::Get(PLATFORM_SOCKETSUBSYSTEM)->DestroySocket(ClientSocket);
			ClientSocket = nullptr;
		}
		ByteBuffer.Reset();
	}

	void CloseListen()
	{
		if (ListenSocket)
		{
			ListenSocket->Close();
			ISocketSubsystem::Get(PLATFORM_SOCKETSUBSYSTEM)->DestroySocket(ListenSocket);
			ListenSocket = nullptr;
		}
	}

	UStreamDeckBridgeSubsystem* Owner = nullptr;
	int32 Port = 5051;

	FRunnableThread* Thread = nullptr;
	FSocket* ListenSocket = nullptr;
	FSocket* ClientSocket = nullptr;

	// Raw UTF-8 byte accumulator; lines are split on '\n' then decoded.
	TArray<uint8> ByteBuffer;
	FCriticalSection ClientCS;
	FThreadSafeBool bRunning = true;
};

// -----------------------------------------------------------------------------

void UStreamDeckBridgeSubsystem::Initialize(FSubsystemCollectionBase& Collection)
{
	Super::Initialize(Collection);
	StartServer(ServerPort);
}

void UStreamDeckBridgeSubsystem::Deinitialize()
{
	StopServer();
	Super::Deinitialize();
}

bool UStreamDeckBridgeSubsystem::StartServer(int32 Port)
{
	StopServer();
	ServerPort = Port;
	Worker = MakeShared<FStreamDeckServerWorker, ESPMode::ThreadSafe>(this, ServerPort);
	return Worker.IsValid();
}

void UStreamDeckBridgeSubsystem::StopServer()
{
	if (Worker.IsValid())
	{
		Worker.Reset();  // destructor joins the thread and closes sockets
	}
}

bool UStreamDeckBridgeSubsystem::IsClientConnected() const
{
	return Worker.IsValid() && Worker->HasClient();
}

bool UStreamDeckBridgeSubsystem::SendState(const FString& Action, const FString& State)
{
	if (!Worker.IsValid())
	{
		return false;
	}
	const FString Line = FString::Printf(TEXT("{\"action\":\"%s\",\"state\":\"%s\"}\n"), *Action, *State);
	return Worker->Send(Line);
}

void UStreamDeckBridgeSubsystem::HandleIncomingLine(const FString& Line)
{
	// Worker thread -> game thread. Capture a weak ptr so we don't touch a torn-down subsystem.
	TWeakObjectPtr<UStreamDeckBridgeSubsystem> WeakThis(this);
	const FString Captured = Line;

	AsyncTask(ENamedThreads::GameThread, [WeakThis, Captured]()
	{
		UStreamDeckBridgeSubsystem* Self = WeakThis.Get();
		if (!Self)
		{
			return;
		}

		// Parse {"action":"...","payload":...}
		FString Action;
		FString Payload;

		TSharedPtr<FJsonObject> JsonObject;
		const TSharedRef<TJsonReader<>> Reader = TJsonReaderFactory<>::Create(Captured);
		if (FJsonSerializer::Deserialize(Reader, JsonObject) && JsonObject.IsValid())
		{
			JsonObject->TryGetStringField(TEXT("action"), Action);

			// payload can be a string or a nested object; serialize objects back to a string.
			const TSharedPtr<FJsonValue> PayloadValue = JsonObject->TryGetField(TEXT("payload"));
			if (PayloadValue.IsValid())
			{
				if (PayloadValue->Type == EJson::String)
				{
					Payload = PayloadValue->AsString();
				}
				else if (PayloadValue->Type == EJson::Object)
				{
					const TSharedRef<TJsonWriter<>> Writer = TJsonWriterFactory<>::Create(&Payload);
					FJsonSerializer::Serialize(PayloadValue->AsObject().ToSharedRef(), Writer);
				}
			}
		}
		else
		{
			// Not JSON? Treat the whole line as the action name (handy for quick tests via netcat).
			Action = Captured;
		}

		UE_LOG(LogStreamDeckBridge, Verbose, TEXT("StreamDeck command: %s | %s"), *Action, *Payload);
		Self->OnStreamDeckCommand.Broadcast(Action, Payload);
	});
}
