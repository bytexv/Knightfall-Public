package studio.knightfall.chess;

import java.net.URI;
import java.util.Arrays;

/** Pure validation shared by the native downloader and unit tests. */
public final class UpdatePolicy {
    private UpdatePolicy() {}
    public static boolean validSource(String url, String version) {
        return version != null && version.matches("(0|[1-9][0-9]{0,8})\\.(0|[1-9][0-9]{0,8})\\.(0|[1-9][0-9]{0,8})") &&
            ("https://github.com/bytexv/Knightfall-Public/releases/download/v" + version + "/Knightfall-" + version + "-Android.apk").equals(url);
    }
    public static boolean allowedRedirect(String url) {
        try {
            URI uri = URI.create(url);
            return "https".equals(uri.getScheme()) && uri.getUserInfo() == null && uri.getPort() == -1 &&
                Arrays.asList("github.com", "release-assets.githubusercontent.com", "objects.githubusercontent.com").contains(uri.getHost());
        } catch (RuntimeException error) { return false; }
    }
    public static boolean validIdentity(String installedPackage, String downloadedPackage, long installedCode, long downloadedCode,
                                        String expectedVersion, String downloadedVersion, String[] installedSigners, String[] downloadedSigners) {
        if (!installedPackage.equals(downloadedPackage) || downloadedCode <= installedCode || !expectedVersion.equals(downloadedVersion) ||
                installedSigners == null || downloadedSigners == null || installedSigners.length == 0 || installedSigners.length != downloadedSigners.length) return false;
        String[] a = installedSigners.clone(), b = downloadedSigners.clone();
        Arrays.sort(a); Arrays.sort(b);
        return Arrays.equals(a, b);
    }
}
