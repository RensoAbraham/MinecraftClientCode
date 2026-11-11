import com.google.gson.Gson;
import java.nio.charset.StandardCharsets;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.Signature;
import java.time.Instant;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.Map;
import one.unicornio.paputauth.SessionClaims;
import one.unicornio.paputauth.SessionTokenVerifier;

public final class SessionTokenVerifierTest {
    private static final Base64.Encoder B64 = Base64.getUrlEncoder().withoutPadding();

    public static void main(String[] args) throws Exception {
        KeyPair pair = KeyPairGenerator.getInstance("Ed25519").generateKeyPair();
        long now = Instant.now().getEpochSecond();
        String token = sign(pair, now, "castle-town:high", "Renso1732", "123e4567-e89b-42d3-a456-426614174000");
        String publicKey = B64.encodeToString(pair.getPublic().getEncoded());

        SessionClaims claims = SessionTokenVerifier.verify(token, "castle-town:high", "paput-1", publicKey);
        require("Renso1732".equals(claims.name()), "nombre verificado");

        expectFailure(() -> SessionTokenVerifier.verify(token, "castle-town:high", "paput-1", publicKey), "replay");
        String wrongAudience = sign(pair, now, "another:instance", "Renso1732", "223e4567-e89b-42d3-a456-426614174000");
        expectFailure(() -> SessionTokenVerifier.verify(wrongAudience, "castle-town:high", "paput-1", publicKey), "audience");
        System.out.println("session token verifier: ok");
    }

    private static String sign(KeyPair pair, long now, String audience, String name, String tokenId) throws Exception {
        Gson gson = new Gson();
        String header = B64.encodeToString(gson.toJson(Map.of("alg", "EdDSA", "kid", "paput-1")).getBytes(StandardCharsets.UTF_8));
        Map<String, Object> claims = new LinkedHashMap<>();
        claims.put("sub", "323e4567-e89b-42d3-a456-426614174000");
        claims.put("name", name);
        claims.put("device_id", "423e4567-e89b-42d3-a456-426614174000");
        claims.put("aud", audience);
        claims.put("iat", now);
        claims.put("exp", now + 120);
        claims.put("jti", tokenId);
        String payload = B64.encodeToString(gson.toJson(claims).getBytes(StandardCharsets.UTF_8));
        String unsigned = header + "." + payload;
        Signature signature = Signature.getInstance("Ed25519");
        signature.initSign(pair.getPrivate());
        signature.update(unsigned.getBytes(StandardCharsets.UTF_8));
        return unsigned + "." + B64.encodeToString(signature.sign());
    }

    private static void expectFailure(ThrowingRunnable action, String label) throws Exception {
        try {
            action.run();
            throw new AssertionError("Debió fallar: " + label);
        } catch (IllegalArgumentException expected) {
            // correcto
        }
    }

    private static void require(boolean condition, String label) {
        if (!condition) throw new AssertionError(label);
    }

    @FunctionalInterface
    private interface ThrowingRunnable { void run() throws Exception; }
}
