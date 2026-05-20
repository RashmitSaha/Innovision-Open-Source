import { NextResponse } from "next/server";

export async function POST(request) {
  try {
    const { videoId } = await request.json();

    if (!videoId) {
      return NextResponse.json({ error: "Video ID is required" }, { status: 400 });
    }
    let YoutubeTranscript;
    try {
      const module = await import("youtube-transcript");
      YoutubeTranscript = module.YoutubeTranscript;
    } catch (importError) {
      console.error("Failed to import youtube-transcript:", importError);
      return NextResponse.json({
        error: "Transcript service unavailable. Please try again later.",
        transcript: generateFallbackTranscript(videoId)
      }, { status: 200 });
    }

    try {
      const transcriptResponse = await YoutubeTranscript.fetchTranscript(videoId, {
        lang: 'en',
        country: 'US',
      });

      if (!transcriptResponse || transcriptResponse.length === 0) {
        throw new Error("Empty transcript received");
      }
      const formattedTranscript = transcriptResponse.map(item => ({
        text: item.text,
        offset: item.offset,
        duration: item.duration,
        timestamp: formatTimestamp(item.offset)
      }));
      const fullText = transcriptResponse.map(item => item.text).join(' ');
      const timestampedText = transcriptResponse
        .map(item => `[${formatTimestamp(item.offset)}] ${item.text}`)
        .join('\n');

      return NextResponse.json({
        transcript: fullText,
        timestampedTranscript: timestampedText,
        detailedTranscript: formattedTranscript,
        duration: transcriptResponse.length > 0
          ? transcriptResponse[transcriptResponse.length - 1].offset + transcriptResponse[transcriptResponse.length - 1].duration
          : 0,
        success: true
      });
    } catch (transcriptError) {
      console.error("Transcript fetch error:", transcriptError);
      try {
        const fallbackTranscript = await YoutubeTranscript.fetchTranscript(videoId);

        if (!fallbackTranscript || fallbackTranscript.length === 0) {
          throw new Error("Empty fallback transcript");
        }

        const fullText = fallbackTranscript.map(item => item.text).join(' ');

        return NextResponse.json({
          transcript: fullText,
          timestampedTranscript: fallbackTranscript.map(item => `[${formatTimestamp(item.offset)}] ${item.text}`).join('\n'),
          detailedTranscript: fallbackTranscript.map(item => ({
            text: item.text,
            offset: item.offset,
            duration: item.duration,
            timestamp: formatTimestamp(item.offset)
          })),
          duration: fallbackTranscript.length > 0
            ? fallbackTranscript[fallbackTranscript.length - 1].offset + fallbackTranscript[fallbackTranscript.length - 1].duration
            : 0,
          success: true,
          warning: "Transcript fetched with default language settings"
        });
      } catch (fallbackError) {
        console.error("Fallback transcript error:", fallbackError);
        return NextResponse.json({
          error: "Could not fetch transcript. The video may not have captions enabled or they may be in an unsupported language.",
          transcript: generateFallbackTranscript(videoId)
        }, { status: 200 });
      }
    }
  } catch (error) {
    console.error("Transcript API error:", error);
    return NextResponse.json({
      error: error.message || "An unexpected error occurred while fetching transcript"
    }, { status: 500 });
  }
}

function formatTimestamp(ms) {
  if (!ms && ms !== 0) return "0:00";
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function generateFallbackTranscript(videoId) {
  return `This video (${videoId}) does not have accessible captions. To generate a course from this video, please:
1. Choose a video with captions/subtitles enabled
2. Or enable auto-captions on the video
3. Videos with manual captions work best for course generation`;
}