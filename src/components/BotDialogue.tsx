import { useEffect, useRef } from "react";
import { MessageCircle, VolumeX } from "lucide-react";
import { botDialogue } from "../lib/bot-dialogue";
import type { GameSession } from "../lib/game";
import type { BotProfile } from "../lib/bots";

export default function BotDialogue({
  game,
  bot,
  voice,
  sound,
  onMute,
}: {
  game: GameSession;
  bot: BotProfile;
  voice: boolean;
  sound: boolean;
  onMute: () => void;
}) {
  const text = botDialogue(game),
    spoken = useRef("");
  useEffect(() => {
    if (!voice || !sound || !window.speechSynthesis) {
      window.speechSynthesis?.cancel();
      return;
    }
    const key = game.id + text;
    if (spoken.current === key) return;
    const speak = () => {
      if (spoken.current === key) return;
      const localVoice = window.speechSynthesis
        .getVoices()
        .find((v) => v.localService && /^en/i.test(v.lang));
      if (!localVoice || typeof SpeechSynthesisUtterance === "undefined") return;
      try {
        const message = new SpeechSynthesisUtterance(`${bot.name}. ${text}`);
        message.voice = localVoice;
        message.rate = 0.98;
        window.speechSynthesis.cancel();
        window.speechSynthesis.speak(message);
        spoken.current = key;
      } catch {
        // Text remains available if the device cannot start speech.
      }
    };
    speak();
    window.speechSynthesis.addEventListener?.("voiceschanged", speak);
    return () => {
      window.speechSynthesis.removeEventListener?.("voiceschanged", speak);
      window.speechSynthesis.cancel();
    };
  }, [text, voice, sound, game.id, bot.name]);
  return (
    <div className="bot-dialogue" aria-label={`${bot.name}'s dialogue`}>
      <MessageCircle size={17} />
      <div>
        <strong>
          {bot.name} <span>· ≈ {bot.elo} Elo</span>
        </strong>
        <p aria-live="polite">{text}</p>
      </div>
      <button
        className="icon-button"
        aria-label="Hide bot dialogue"
        title="Hide dialogue (enable again in Settings)"
        onClick={onMute}
      >
        <VolumeX size={15} />
      </button>
    </div>
  );
}
