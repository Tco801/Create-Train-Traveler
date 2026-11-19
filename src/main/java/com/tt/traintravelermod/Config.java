package com.tt.traintravelermod;

import net.neoforged.neoforge.common.ModConfigSpec;

public class Config {
    private static final ModConfigSpec.Builder BUILDER = new ModConfigSpec.Builder();

    public static final ModConfigSpec.IntValue API_PORT = BUILDER
            .comment("Port used to host the web server and API endpoints (default: 25581 to avoid conflicts with CRN)")
            .defineInRange("apiPort", 25581, 1024, 65535);

    public static final ModConfigSpec.ConfigValue<String> PUBLIC_HOST = BUILDER
            .comment("Public IP address or domain shown by /traintraveler website (e.g. play.yourserver.com or leave empty for http://localhost:<port>)")
            .define("publicHost", "");

    public static final ModConfigSpec.ConfigValue<String> API_KEY = BUILDER
            .comment("Optional secret key required in the X-API-Key header (leave empty to disable)")
            .define("apiKey", "");

    static final ModConfigSpec SPEC = BUILDER.build();
}