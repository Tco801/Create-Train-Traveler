package com.tt.traintravellermod;

import com.mojang.logging.LogUtils;
import net.neoforged.bus.api.IEventBus;
import net.neoforged.bus.api.SubscribeEvent;
import net.neoforged.fml.ModContainer;
import net.neoforged.fml.common.Mod;
import net.neoforged.fml.config.ModConfig;
import net.neoforged.neoforge.common.NeoForge;
import net.neoforged.neoforge.event.server.ServerStartedEvent;
import net.neoforged.neoforge.event.server.ServerStoppingEvent;
import net.neoforged.neoforge.event.tick.ServerTickEvent;
import org.slf4j.Logger;

import java.util.List;
import java.util.Map;

@Mod(CreateTrainTraveller.MODID)
public class CreateTrainTraveller {
    public static final String MODID = "createtraintraveller";
    public static final Logger LOGGER = LogUtils.getLogger();
    private int tickCounter = 0;

    public CreateTrainTraveller(IEventBus modEventBus, ModContainer modContainer) {
        NeoForge.EVENT_BUS.register(this);
        modContainer.registerConfig(ModConfig.Type.COMMON, Config.SPEC);
    }

    @SubscribeEvent
    public void onServerStarted(ServerStartedEvent event) {
        ApiServer.start(Config.API_PORT.get());
    }

    @SubscribeEvent
    public void onServerStopping(ServerStoppingEvent event) {
        ApiServer.stop();
    }

    @SubscribeEvent
    public void onServerTick(ServerTickEvent.Post event) {
        tickCounter++;
        if (tickCounter >= 20) {
            tickCounter = 0;
            long time = event.getServer().overworld().getDayTime();

            List<Map<String, Object>> mockStations = List.of(
                    Map.of("id", "stazione_centrale", "name", "Stazione Centrale", "x", 100, "y", 64, "z", -200)
            );
            List<Map<String, Object>> mockTrains = List.of(
                    Map.of("id", "train_1", "name", "Frecciarossa 101", "speed", 12.5, "status", "RUNNING")
            );
            List<Map<String, Object>> mockCategories = List.of(
                    Map.of("id", "AV", "code", "AV", "name", "Alta Velocità")
            );
            List<Map<String, Object>> mockLines = List.of(
                    Map.of("id", "L1", "name", "Linea 1", "color", "#FF0000")
            );

            ApiServer.currentSnapshot = new ServerSnapshot(
                    mockStations,
                    mockTrains,
                    mockCategories,
                    mockLines,
                    time
            );
        }
    }
}