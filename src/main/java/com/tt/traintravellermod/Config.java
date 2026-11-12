package com.tt.traintravellermod;

import net.neoforged.neoforge.common.ModConfigSpec;

public class Config {
    private static final ModConfigSpec.Builder BUILDER = new ModConfigSpec.Builder();

    public static final ModConfigSpec.IntValue API_PORT = BUILDER
            .comment("Porta su cui avviare il web server e le API")
            .defineInRange("apiPort", 25580, 1024, 65535);

    public static final ModConfigSpec.ConfigValue<String> API_KEY = BUILDER
            .comment("Chiave segreta richiesta nell'header X-API-Key (lascia vuoto per disabilitare)")
            .define("apiKey", "");

    static final ModConfigSpec SPEC = BUILDER.build();
}