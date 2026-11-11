package one.unicornio.paputauth;

import java.util.Collections;
import java.util.Map;
import java.util.WeakHashMap;
import net.minecraft.network.Connection;
import net.neoforged.neoforge.event.entity.player.PlayerNegotiationEvent;

/** Conserva el nombre que el servidor recibió, sin confiar en el payload del cliente. */
public final class ServerIdentityTracker {
    private static final Map<Connection, String> NAMES = Collections.synchronizedMap(new WeakHashMap<>());

    public static void onNegotiation(PlayerNegotiationEvent event) {
        NAMES.put(event.getConnection(), event.getProfile().getName());
    }

    public static String takeName(Connection connection) {
        return NAMES.remove(connection);
    }

    private ServerIdentityTracker() {}
}
