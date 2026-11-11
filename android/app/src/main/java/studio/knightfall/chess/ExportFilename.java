package studio.knightfall.chess;

final class ExportFilename {
    private ExportFilename() {}

    static String sanitize(String input) {
        if (input == null) return "Knightfall-game.pgn";
        String basename = input.substring(Math.max(input.lastIndexOf('/'), input.lastIndexOf('\\')) + 1);
        String cleaned = basename.replaceAll("[\\x00-\\x1F\\x7F<>:\"|?*]", "_").trim();
        cleaned = cleaned.replaceAll("^[. ]+|[. ]+$", "");
        if (cleaned.isEmpty()) return "Knightfall-game.pgn";
        if (cleaned.length() > 128) {
            int dot = cleaned.lastIndexOf('.');
            String extension = dot > 0 && cleaned.length() - dot <= 12 ? cleaned.substring(dot) : "";
            cleaned = cleaned.substring(0, 128 - extension.length()) + extension;
        }
        return cleaned;
    }
}
