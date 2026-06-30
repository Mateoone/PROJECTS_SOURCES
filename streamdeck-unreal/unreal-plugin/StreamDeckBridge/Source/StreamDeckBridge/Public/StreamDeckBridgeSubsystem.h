// Copyright MIP. POC Stream Deck <-> Unreal bridge.

#pragma once

#include "CoreMinimal.h"
#include "Subsystems/GameInstanceSubsystem.h"
#include "StreamDeckBridgeSubsystem.generated.h"

/**
 * Fired on the GAME THREAD every time the Stream Deck plugin sends a command.
 * Action  = logical name of the button command (e.g. "Fire", "Pause", "SpawnEnemy").
 * Payload = free-form JSON string configured in the Property Inspector (may be empty).
 */
DECLARE_DYNAMIC_MULTICAST_DELEGATE_TwoParams(FOnStreamDeckCommand, const FString&, Action, const FString&, Payload);

class FStreamDeckServerWorker;

/**
 * GameInstanceSubsystem that owns a tiny TCP server. The Stream Deck plugin connects to it
 * and sends one JSON object per line: {"action":"Fire","payload":{...}}\n
 * Each line is marshalled to the game thread and broadcast through OnStreamDeckCommand.
 *
 * Lives for the whole game session (editor PIE or packaged build).
 */
UCLASS()
class STREAMDECKBRIDGE_API UStreamDeckBridgeSubsystem : public UGameInstanceSubsystem
{
	GENERATED_BODY()

public:
	virtual void Initialize(FSubsystemCollectionBase& Collection) override;
	virtual void Deinitialize() override;

	/** Bind your gameplay logic here. */
	UPROPERTY(BlueprintAssignable, Category = "StreamDeck")
	FOnStreamDeckCommand OnStreamDeckCommand;

	/** Starts the TCP server. Auto-called on Initialize with the default port. */
	UFUNCTION(BlueprintCallable, Category = "StreamDeck")
	bool StartServer(int32 Port = 5051);

	UFUNCTION(BlueprintCallable, Category = "StreamDeck")
	void StopServer();

	UFUNCTION(BlueprintPure, Category = "StreamDeck")
	bool IsClientConnected() const;

	/**
	 * Push state back to the Stream Deck plugin to update a button title.
	 * Sends {"action":Action,"state":State}\n (legacy convenience = SetButtonTitle).
	 */
	UFUNCTION(BlueprintCallable, Category = "StreamDeck")
	bool SendState(const FString& Action, const FString& State);

	// --- Callbacks UE -> button: update every button bound to "Action" at any time. ---

	/** Set the title text of all buttons bound to Action. */
	UFUNCTION(BlueprintCallable, Category = "StreamDeck|Callback")
	bool SetButtonTitle(const FString& Action, const FString& Title);

	/**
	 * Set the image of all buttons bound to Action.
	 * ImageName = a bundled plugin image (e.g. "bt_03", under the plugin's imgs/),
	 * or a full data URI ("data:image/png;base64,...").
	 */
	UFUNCTION(BlueprintCallable, Category = "StreamDeck|Callback")
	bool SetButtonImage(const FString& Action, const FString& ImageName);

	/** Set the state index (for multi-state actions) of all buttons bound to Action. */
	UFUNCTION(BlueprintCallable, Category = "StreamDeck|Callback")
	bool SetButtonState(const FString& Action, int32 StateIndex);

	/** Called from the worker thread; re-dispatches onto the game thread. */
	void HandleIncomingLine(const FString& Line);

private:
	TSharedPtr<FStreamDeckServerWorker, ESPMode::ThreadSafe> Worker;
	int32 ServerPort = 5051;
};
