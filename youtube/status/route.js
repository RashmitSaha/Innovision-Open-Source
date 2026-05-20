import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { getServerSession } from "@/lib/auth-server";

export async function GET(request) {
  try {
    const session = await getServerSession();

    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const youtubeCoursesSnapshot = await adminDb
      .collection("users")
      .doc(session.user.email)
      .collection("youtube-courses")
      .get();

    const count = youtubeCoursesSnapshot.size;
    const courses = youtubeCoursesSnapshot.docs.map(doc => ({
      id: doc.id,
      title: doc.data().title || doc.data().videoTitle || "Untitled Course",
      thumbnail: doc.data().thumbnail,
      progress: doc.data().progress || 0,
      createdAt: doc.data().createdAt,
      lastAccessedAt: doc.data().lastAccessedAt,
      chaptersCount: doc.data().chapters?.length || 0,
      completedChapters: doc.data().completedChapters?.length || 0
    }));
    courses.sort((a, b) => {
      const dateA = a.lastAccessedAt ? new Date(a.lastAccessedAt) : new Date(0);
      const dateB = b.lastAccessedAt ? new Date(b.lastAccessedAt) : new Date(0);
      return dateB - dateA;
    });

    return NextResponse.json({
      count,
      courses,
      limit: 5,
      remaining: Math.max(0, 5 - count)
    });
  } catch (error) {
    console.error("Error fetching YouTube course status:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}