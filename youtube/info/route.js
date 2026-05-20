import { NextResponse } from "next/server";

export async function POST(request) {
  try {
    const { url } = await request.json();

    if (!url) {
      return NextResponse.json({ error: "URL is required" }, { status: 400 });
    }
    const videoId = extractVideoId(url);

    if (!videoId) {
      return NextResponse.json({ error: "Invalid YouTube URL" }, { status: 400 });
    }
    const videoInfo = await fetchVideoInfo(videoId);

    return NextResponse.json({
      videoId,
      ...videoInfo
    });
  } catch (error) {
    console.error("Video info fetch error:", error);
    return NextResponse.json({ error: error.message || "Failed to fetch video info" }, { status: 500 });
  }
}

function extractVideoId(url) {
  if (!url) return null;

  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\n?#]+)/,
    /youtube\.com\/embed\/([^&\n?#]+)/,
    /youtube\.com\/v\/([^&\n?#]+)/,
    /youtube\.com\/shorts\/([^&\n?#]+)/
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match && match[1]) return match[1];
  }
  return null;
}

async function fetchVideoInfo(videoId) {
  try {
    const oembedUrl = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    const oembedResponse = await fetch(oembedUrl, {
      signal: controller.signal
    }).catch(err => {
      console.error("oEmbed fetch error:", err);
      return null;
    });

    clearTimeout(timeoutId);

    if (oembedResponse && oembedResponse.ok) {
      const oembedData = await oembedResponse.json();

      return {
        title: oembedData.title || "YouTube Video",
        author: oembedData.author_name || "Unknown",
        authorUrl: oembedData.author_url || "",
        thumbnail: `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
        thumbnailFallback: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
        provider: oembedData.provider_name || "YouTube",
        success: true
      };
    }
  } catch (oembedError) {
    console.error("oEmbed fetch failed:", oembedError);
  }
  return {
    title: "YouTube Video",
    author: "Unknown",
    thumbnail: `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
    thumbnailFallback: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
    success: true,
    warning: "Could not fetch full video details"
  };
}
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const url = searchParams.get('url');

    if (!url) {
      return NextResponse.json({ error: "URL parameter required" }, { status: 400 });
    }

    const videoId = extractVideoId(url);

    if (!videoId) {
      return NextResponse.json({ valid: false, error: "Invalid YouTube URL" });
    }

    return NextResponse.json({
      valid: true,
      videoId,
      thumbnail: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`
    });
  } catch (error) {
    console.error("Video validation error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}