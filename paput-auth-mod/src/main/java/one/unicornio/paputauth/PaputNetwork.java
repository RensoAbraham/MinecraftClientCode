package one.unicornio.paputauth;

import net.neoforged.neoforge.network.event.RegisterConfigurationTasksEvent;
import net.neoforged.neoforge.network.event.RegisterPayloadHandlersEvent;
import net.neoforged.neoforge.network.registration.HandlerThread;
import net.neoforged.neoforge.network.registration.PayloadRegistrar;

public final class PaputNetwork {
    public static void registerPayloads(RegisterPayloadHandlersEvent event) {
        PayloadRegistrar registrar = event.registrar("1").executesOn(HandlerThread.NETWORK);
        registrar.configurationToClient(
                AuthRequestPayload.TYPE,
                AuthRequestPayload.STREAM_CODEC,
                ClientAuthHandler::handleRequest);
        registrar.configurationToServer(
                AuthTokenPayload.TYPE,
                AuthTokenPayload.STREAM_CODEC,
                ServerAuthHandler::handleToken);
    }

    public static void registerConfigurationTask(RegisterConfigurationTasksEvent event) {
        event.register(new AuthConfigurationTask(PaputServerConfig.AUDIENCE.get().trim()));
    }

    private PaputNetwork() {}
}
