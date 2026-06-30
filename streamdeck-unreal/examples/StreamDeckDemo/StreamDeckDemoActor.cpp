// Copyright MIP. Demo actor for the Stream Deck <-> Unreal bridge.

#include "StreamDeckDemoActor.h"

#include "Components/StaticMeshComponent.h"
#include "Dom/JsonObject.h"
#include "Engine/StaticMesh.h"
#include "Materials/MaterialInstanceDynamic.h"
#include "Serialization/JsonReader.h"
#include "Serialization/JsonSerializer.h"
#include "StreamDeckBridgeSubsystem.h"
#include "UObject/ConstructorHelpers.h"

AStreamDeckDemoActor::AStreamDeckDemoActor()
{
	PrimaryActorTick.bCanEverTick = true;

	Mesh = CreateDefaultSubobject<UStaticMeshComponent>(TEXT("Mesh"));
	RootComponent = Mesh;

	// Use the engine cube so the actor is visible out of the box.
	static ConstructorHelpers::FObjectFinder<UStaticMesh> CubeMesh(TEXT("/Engine/BasicShapes/Cube.Cube"));
	if (CubeMesh.Succeeded())
	{
		Mesh->SetStaticMesh(CubeMesh.Object);
	}
}

void AStreamDeckDemoActor::BeginPlay()
{
	Super::BeginPlay();

	// Spawn a dynamic material so we can recolor the cube at runtime.
	if (Mesh && Mesh->GetMaterial(0))
	{
		DynMaterial = Mesh->CreateAndSetMaterialInstanceDynamic(0);
	}

	if (UStreamDeckBridgeSubsystem* Bridge = GetBridge())
	{
		Bridge->OnStreamDeckCommand.AddDynamic(this, &AStreamDeckDemoActor::HandleStreamDeckCommand);
		UE_LOG(LogTemp, Log, TEXT("[StreamDeckDemo] bound to bridge (client connected: %s)"),
			Bridge->IsClientConnected() ? TEXT("yes") : TEXT("no"));
	}
	else
	{
		UE_LOG(LogTemp, Warning, TEXT("[StreamDeckDemo] StreamDeckBridgeSubsystem not found"));
	}
}

void AStreamDeckDemoActor::EndPlay(const EEndPlayReason::Type EndPlayReason)
{
	if (UStreamDeckBridgeSubsystem* Bridge = GetBridge())
	{
		Bridge->OnStreamDeckCommand.RemoveDynamic(this, &AStreamDeckDemoActor::HandleStreamDeckCommand);
	}
	Super::EndPlay(EndPlayReason);
}

UStreamDeckBridgeSubsystem* AStreamDeckDemoActor::GetBridge() const
{
	if (const UWorld* World = GetWorld())
	{
		if (UGameInstance* GI = World->GetGameInstance())
		{
			return GI->GetSubsystem<UStreamDeckBridgeSubsystem>();
		}
	}
	return nullptr;
}

void AStreamDeckDemoActor::Tick(float DeltaSeconds)
{
	Super::Tick(DeltaSeconds);
	if (bSpinning)
	{
		AddActorLocalRotation(FRotator(0.f, SpinSpeed * DeltaSeconds, 0.f));
	}
}

void AStreamDeckDemoActor::HandleStreamDeckCommand(const FString& Action, const FString& Payload)
{
	UE_LOG(LogTemp, Log, TEXT("[StreamDeckDemo] %s | %s"), *Action, *Payload);

	// Parse the payload (may be empty / not an object — that's fine).
	TSharedPtr<FJsonObject> Json;
	if (!Payload.IsEmpty())
	{
		const TSharedRef<TJsonReader<>> Reader = TJsonReaderFactory<>::Create(Payload);
		FJsonSerializer::Deserialize(Reader, Json);
	}

	FString FeedbackState = TEXT("ok");

	if (Action.Equals(TEXT("Color"), ESearchCase::IgnoreCase))
	{
		double R = 1.0, G = 1.0, B = 1.0;
		if (Json.IsValid())
		{
			Json->TryGetNumberField(TEXT("r"), R);
			Json->TryGetNumberField(TEXT("g"), G);
			Json->TryGetNumberField(TEXT("b"), B);
		}
		if (DynMaterial)
		{
			// "BaseColor" is the param name on M_Basic_Wall; adapt to your material.
			DynMaterial->SetVectorParameterValue(TEXT("Color"), FLinearColor(R, G, B));
		}
		FeedbackState = FString::Printf(TEXT("rgb %.1f/%.1f/%.1f"), R, G, B);
	}
	else if (Action.Equals(TEXT("Scale"), ESearchCase::IgnoreCase))
	{
		double Value = 1.0;
		if (Json.IsValid())
		{
			Json->TryGetNumberField(TEXT("value"), Value);
		}
		SetActorScale3D(FVector(Value));
		FeedbackState = FString::Printf(TEXT("x%.2f"), Value);
	}
	else if (Action.Equals(TEXT("Spin"), ESearchCase::IgnoreCase))
	{
		bSpinning = !bSpinning;
		FeedbackState = bSpinning ? TEXT("spinning") : TEXT("stopped");
	}
	else if (Action.Equals(TEXT("Reset"), ESearchCase::IgnoreCase))
	{
		bSpinning = false;
		SetActorScale3D(FVector::OneVector);
		SetActorRotation(FRotator::ZeroRotator);
		if (DynMaterial)
		{
			DynMaterial->SetVectorParameterValue(TEXT("Color"), FLinearColor::White);
		}
		FeedbackState = TEXT("reset");
	}
	else
	{
		UE_LOG(LogTemp, Warning, TEXT("[StreamDeckDemo] unknown action: %s"), *Action);
		FeedbackState = TEXT("?");
	}

	// Push the resulting state back to the Stream Deck button (updates its title).
	if (UStreamDeckBridgeSubsystem* Bridge = GetBridge())
	{
		Bridge->SendState(Action, FeedbackState);
	}
}
