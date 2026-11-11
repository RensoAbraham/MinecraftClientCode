package one.unicornio.paputauth;

import net.neoforged.neoforge.common.ModConfigSpec;

public final class PaputServerConfig {
    public static final ModConfigSpec SPEC;
    public static final ModConfigSpec.ConfigValue<String> AUDIENCE;
    public static final ModConfigSpec.ConfigValue<String> SESSION_PUBLIC_KEY;
    public static final ModConfigSpec.ConfigValue<String> SESSION_KEY_ID;

    static {
        ModConfigSpec.Builder builder = new ModConfigSpec.Builder();
        builder.comment("Paput Auth valida la identidad antes de entrar al mundo.").push("auth");
        AUDIENCE = builder
                .comment("Debe coincidir con paput:<groupId> del launcher.")
                .define("audience", "paput:castle-town");
        SESSION_PUBLIC_KEY = builder
                .comment("Clave pública Ed25519 SPKI codificada en base64url, publicada por /v1/session-key.")
                .define("sessionPublicKey", "");
        SESSION_KEY_ID = builder
                .comment("Identificador de la clave activa del backend.")
                .define("sessionKeyId", "paput-1");
        builder.pop();
        SPEC = builder.build();
    }

    private PaputServerConfig() {}
}
