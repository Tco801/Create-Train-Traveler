package com.tt.traintravellermod;

import com.google.gson.reflect.TypeToken;
import com.mojang.logging.LogUtils;
import de.mrjulsen.crn.api.core.RailwayBackendApi;
import de.mrjulsen.crn.api.core.snapshot.JourneySnapshot;
import de.mrjulsen.crn.api.core.snapshot.TrainSnapshot;
import de.mrjulsen.crn.api.json.JsonConvert;
import net.neoforged.bus.api.IEventBus;
import net.neoforged.bus.api.SubscribeEvent;
import net.neoforged.fml.ModContainer;
import net.neoforged.fml.common.Mod;
import net.neoforged.fml.config.ModConfig;
import net.neoforged.neoforge.common.NeoForge;
import net.neoforged.neoforge.event.RegisterCommandsEvent;
import net.neoforged.neoforge.event.server.ServerStartedEvent;
import net.neoforged.neoforge.event.server.ServerStoppingEvent;
import net.neoforged.neoforge.event.tick.ServerTickEvent;
import org.slf4j.Logger;

import java.lang.reflect.Type;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.Optional;

@Mod(CreateTrainTraveller.MODID)
public class CreateTrainTraveller {
    public static final String MODID = "createtraintraveller";
    public static final Logger LOGGER = LogUtils.getLogger();
    private static final Type LIST_MAP_TYPE = new TypeToken<List<Map<String, Object>>>() {}.getType();
    private static final Type MAP_TYPE = new TypeToken<Map<String, Object>>() {}.getType();

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
            updateSnapshotFromCrn(event.getServer().overworld().getDayTime());
        }
    }

    private void updateSnapshotFromCrn(long fallbackWorldTime) {
        try {
            if (!RailwayBackendApi.isActive()) {
                ApiServer.currentSnapshot = new ServerSnapshot(
                        Collections.emptyList(),
                        Collections.emptyList(),
                        Collections.emptyList(),
                        Collections.emptyList(),
                        fallbackWorldTime
                );
                return;
            }

            long worldTime = RailwayBackendApi.getCurrentTime();
            if (worldTime <= 0) {
                worldTime = fallbackWorldTime;
            }

            List<Map<String, Object>> stations = toMapList(RailwayBackendApi.getAllStations());
            List<Map<String, Object>> categories = toMapList(RailwayBackendApi.getAllCategories());
            List<Map<String, Object>> lines = toMapList(RailwayBackendApi.getAllLines());

            List<TrainSnapshot> rawTrains = RailwayBackendApi.getAllTrains();
            List<Map<String, Object>> trains = new ArrayList<>(rawTrains.size());

            for (TrainSnapshot trainSnap : rawTrains) {
                Map<String, Object> trainMap = toMap(trainSnap);
                if (trainMap == null) continue;

                // Garantisce che sia "id" che "train_id" siano valorizzati per il frontend
                String idStr = trainSnap.trainId().toString();
                trainMap.putIfAbsent("id", idStr);
                trainMap.putIfAbsent("train_id", idStr);

                // Allega il JourneySnapshot reale (con tutte le sezioni, fermate, binari e orari)
                Optional<JourneySnapshot> journeyOpt = RailwayBackendApi.getJourney(trainSnap.trainId());
                if (journeyOpt.isPresent()) {
                    Map<String, Object> journeyMap = toMap(journeyOpt.get());
                    if (journeyMap != null) {
                        trainMap.put("journey", journeyMap);
                    }
                }

                trains.add(trainMap);
            }

            ApiServer.currentSnapshot = new ServerSnapshot(
                    stations,
                    trains,
                    categories,
                    lines,
                    worldTime
            );
        } catch (Exception e) {
            LOGGER.error("Failed to fetch live railway data from CRN API", e);
        }
    }

    private static List<Map<String, Object>> toMapList(Object crnList) {
        if (crnList == null) return Collections.emptyList();
        List<Map<String, Object>> parsed = JsonConvert.builder().create().fromJson(JsonConvert.toJson(crnList), LIST_MAP_TYPE);
        return parsed != null ? parsed : Collections.emptyList();
    }

    private static Map<String, Object> toMap(Object crnObj) {
        if (crnObj == null) return null;
        return JsonConvert.builder().create().fromJson(JsonConvert.toJson(crnObj), MAP_TYPE);
    }

    @SubscribeEvent
    public void onRegisterCommands(RegisterCommandsEvent event) {
        TrainTravellerCommand.register(event.getDispatcher());
    }
}