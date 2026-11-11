package one.unicornio.paputauth;

import java.util.function.Consumer;
import net.minecraft.network.protocol.common.custom.CustomPacketPayload;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.server.network.ConfigurationTask;
import net.neoforged.neoforge.network.configuration.ICustomConfigurationTask;

public record AuthConfigurationTask(String audience) implements ICustomConfigurationTask {
    public static final ConfigurationTask.Type TYPE = new ConfigurationTask.Type(
            ResourceLocation.fromNamespaceAndPath(PaputAuth.MOD_ID, "authenticate"));

    @Override
    public void run(Consumer<CustomPacketPayload> sender) {
        sender.accept(new AuthRequestPayload(audience));
    }

    @Override
    public ConfigurationTask.Type type() {
        return TYPE;
    }
}
