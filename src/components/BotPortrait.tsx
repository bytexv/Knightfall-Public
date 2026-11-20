const portraitDirectory = `${import.meta.env?.BASE_URL ?? "./"}images/bots/`;

export default function BotPortrait({ botId }: { botId: string }) {
  return (
    <img
      className="bot-portrait"
      data-bot={botId}
      src={`${portraitDirectory}${botId}.webp`}
      width={48}
      height={48}
      alt=""
      draggable={false}
    />
  );
}
