// Copyright MIP. Demo actor for the Stream Deck <-> Unreal bridge.
//
// Drop this pair (.h/.cpp) into YOUR game module's Source folder, then add
// "StreamDeckBridge" to that module's PublicDependencyModuleNames in its Build.cs.
// Place one instance in the level (or spawn it) and press the configured Stream Deck buttons.

#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "StreamDeckDemoActor.generated.h"

class UStaticMeshComponent;
class UStreamDeckBridgeSubsystem;

/**
 * Reacts to Stream Deck commands:
 *   Action "Color"  payload {"r":1,"g":0,"b":0}  -> tints the cube
 *   Action "Scale"  payload {"value":2.0}        -> sets the cube scale
 *   Action "Spin"   payload (none)               -> toggles rotation
 *   Action "Reset"  payload (none)               -> back to defaults
 * On every command it also pushes the current state back to the button via SendState().
 */
UCLASS()
class AStreamDeckDemoActor : public AActor
{
	GENERATED_BODY()

public:
	AStreamDeckDemoActor();

	virtual void Tick(float DeltaSeconds) override;

protected:
	virtual void BeginPlay() override;
	virtual void EndPlay(const EEndPlayReason::Type EndPlayReason) override;

	/** Bound to UStreamDeckBridgeSubsystem::OnStreamDeckCommand. Runs on the game thread. */
	UFUNCTION()
	void HandleStreamDeckCommand(const FString& Action, const FString& Payload);

private:
	UStreamDeckBridgeSubsystem* GetBridge() const;

	UPROPERTY(VisibleAnywhere)
	TObjectPtr<UStaticMeshComponent> Mesh;

	UPROPERTY(Transient)
	TObjectPtr<class UMaterialInstanceDynamic> DynMaterial;

	bool bSpinning = false;
	float SpinSpeed = 90.f; // deg/s
};
