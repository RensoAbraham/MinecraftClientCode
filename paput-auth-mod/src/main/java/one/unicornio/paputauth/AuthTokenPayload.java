package one.unicornio.paputauth;

import io.netty.buffer.ByteBuf;
import net.minecraft.network.codec.ByteBufCodecs;
import net.minecraft.network.codec.StreamCodec;
import net.minecraft.network.protocol.common.custom.CustomPacketPayload;
import net.minecraft.resources.ResourceLocation;

public record AuthTokenPayload(String token) implements CustomPacketPayload {
    public static final Type<AuthTokenPayload> TYPE = new Type<>(
            ResourceLocation.fromNamespaceAndPath(PaputAuth.MOD_ID, "token"));
    public static final StreamCodec<ByteBuf, AuthTokenPayload> STREAM_CODEC = StreamCodec.composite(
            ByteBufCodecs.STRING_UTF8,
            AuthTokenPayload::token,
            AuthTokenPayload::new);

    @Override
    public Type<? extends CustomPacketPayload> type() {
        return TYPE;
    }
}
