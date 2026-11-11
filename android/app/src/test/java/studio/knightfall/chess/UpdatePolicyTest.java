package studio.knightfall.chess;
import org.junit.Test;
import static org.junit.Assert.*;
public class UpdatePolicyTest {
    @Test public void validatesExactStableReleaseAndRedirectHosts() {
        assertTrue(UpdatePolicy.validSource("https://github.com/bytexv/Knightfall-Public/releases/download/v1.5.0/Knightfall-1.5.0-Android.apk", "1.5.0"));
        assertFalse(UpdatePolicy.validSource("https://evil.test/app.apk", "1.5.0"));
        assertFalse(UpdatePolicy.validSource("https://github.com/bytexv/Knightfall-Public/releases/download/v1.5.0-beta/Knightfall-1.5.0-beta-Android.apk", "1.5.0-beta"));
        assertTrue(UpdatePolicy.allowedRedirect("https://release-assets.githubusercontent.com/a?token=x"));
        for (String url : new String[]{"http://github.com/a", "https://github.com.evil.test/a", "https://x@github.com/a", "https://github.com:443/a", "file:///tmp/a"}) assertFalse(UpdatePolicy.allowedRedirect(url));
    }
    @Test public void requiresSameAppSameSignerAndNewerCode() {
        assertTrue(UpdatePolicy.validIdentity("app", "app", 8, 9, "1.5.0", "1.5.0", new String[]{"trusted"}, new String[]{"trusted"}));
        assertFalse(UpdatePolicy.validIdentity("app", "other", 8, 9, "1.5.0", "1.5.0", new String[]{"trusted"}, new String[]{"trusted"}));
        assertFalse(UpdatePolicy.validIdentity("app", "app", 8, 8, "1.5.0", "1.5.0", new String[]{"trusted"}, new String[]{"trusted"}));
        assertFalse(UpdatePolicy.validIdentity("app", "app", 8, 9, "1.5.0", "1.5.1", new String[]{"trusted"}, new String[]{"trusted"}));
        assertFalse(UpdatePolicy.validIdentity("app", "app", 8, 9, "1.5.0", "1.5.0", new String[]{"trusted"}, new String[]{"other"}));
        assertFalse(UpdatePolicy.validIdentity("app", "app", 8, 9, "1.5.0", "1.5.0", new String[]{}, new String[]{}));
    }
}
