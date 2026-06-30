// Copyright MIP. POC Stream Deck <-> Unreal bridge.

#pragma once

#include "CoreMinimal.h"
#include "Modules/ModuleManager.h"

class FStreamDeckBridgeModule : public IModuleInterface
{
public:
	virtual void StartupModule() override {}
	virtual void ShutdownModule() override {}
};
