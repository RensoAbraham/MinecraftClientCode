package one.unicornio.paputauth;

import com.mojang.logging.LogUtils;
import net.neoforged.bus.api.IEventBus;
import net.neoforged.fml.ModContainer;
import net.neoforged.fml.common.Mod;
import net.neoforged.fml.config.ModConfig;
import net.neoforged.neoforge.common.NeoForge;
import org.slf4j.Logger;

@Mod(PaputAuth.MOD_ID)
public final class PaputAuth {
    public static final String MOD_ID = "paput_auth";
    public static final Logger LOGGER = LogUtils.getLogger();

    public PaputAuth(IEventBus modBus, ModContainer container) {
        modBus.addListener(PaputNetwork::registerPayloads);
        modBus.addListener(PaputNetwork::registerConfigurationTask);
        NeoForge.EVENT_BUS.addListener(ServerIdentityTracker::onNegotiation);
        container.registerConfig(ModConfig.Type.SERVER, PaputServerConfig.SPEC);
        LOGGER.info("Paput Auth cargado");
    }
}
