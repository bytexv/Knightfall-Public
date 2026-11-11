package studio.knightfall.chess;

import org.junit.Test;
import static org.junit.Assert.*;

public class ExportFilenameTest {
    @Test public void stripsDirectoriesAndControlCharacters() {
        assertEquals("game_name.pgn", ExportFilename.sanitize("../../game\nname.pgn"));
        assertEquals("match.pgn", ExportFilename.sanitize("C:\\Downloads\\match.pgn"));
    }
    @Test public void usesDefaultForEmptyBasename() {
        assertEquals("Knightfall-game.pgn", ExportFilename.sanitize("../"));
        assertEquals("Knightfall-game.pgn", ExportFilename.sanitize(null));
        assertEquals("Knightfall-game.pgn", ExportFilename.sanitize(".."));
    }
    @Test public void keepsUnicodeAndKnownExtensions() {
        assertEquals("Échec 2026.pgn", ExportFilename.sanitize("Échec 2026.pgn"));
        assertEquals("backup.json", ExportFilename.sanitize("backup.json"));
    }
    @Test public void boundsLongNamesWithoutDroppingExtension() {
        String result = ExportFilename.sanitize("a".repeat(200) + ".pgn");
        assertEquals(128, result.length());
        assertTrue(result.endsWith(".pgn"));
    }
}
