// Copyright MIP. POC Stream Deck <-> Unreal bridge.

using UnrealBuildTool;

public class StreamDeckBridge : ModuleRules
{
	public StreamDeckBridge(ReadOnlyTargetRules Target) : base(Target)
	{
		PCHUsage = ModuleRules.PCHUsageMode.UseExplicitOrSharedPCHs;

		PublicDependencyModuleNames.AddRange(new string[]
		{
			"Core",
			"CoreUObject",
			"Engine"
		});

		PrivateDependencyModuleNames.AddRange(new string[]
		{
			"Sockets",
			"Networking",
			"Json"
		});
	}
}
