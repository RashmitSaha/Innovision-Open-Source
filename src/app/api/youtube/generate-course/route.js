import { NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");
const courseSchema = {
  type: "OBJECT",
  properties: {
    title: { type: "STRING" },
    description: { type: "STRING" },
    difficulty: { type: "STRING" },
    estimatedDuration: { type: "STRING" },
    learningObjectives: { type: "ARRAY", items: { type: "STRING" } },
    prerequisites: { type: "ARRAY", items: { type: "STRING" } },
    chapters: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          number: { type: "INTEGER" },
          title: { type: "STRING" },
          description: { type: "STRING" },
          duration: { type: "STRING" },
          content: {
            type: "OBJECT",
            properties: {
              introduction: { type: "STRING" },
              mainContent: { type: "STRING" },
              keyPoints: { type: "ARRAY", items: { type: "STRING" } },
              examples: { type: "ARRAY", items: { type: "STRING" } },
              summary: { type: "STRING" }
            },
            required: ["introduction", "mainContent", "keyPoints", "summary"]
          },
          exercises: {
            type: "ARRAY",
            items: {
              type: "OBJECT",
              properties: {
                type: { type: "STRING" },
                title: { type: "STRING" },
                description: { type: "STRING" },
                difficulty: { type: "STRING" },
                estimatedTime: { type: "STRING" }
              },
              required: ["type", "title", "description"]
            }
          },
          quiz: {
            type: "OBJECT",
            properties: {
              title: { type: "STRING" },
              questions: {
                type: "ARRAY",
                items: {
                  type: "OBJECT",
                  properties: {
                    question: { type: "STRING" },
                    options: { type: "ARRAY", items: { type: "STRING" } },
                    correctAnswer: { type: "INTEGER" },
                    explanation: { type: "STRING" }
                  },
                  required: ["question", "options", "correctAnswer", "explanation"]
                }
              }
            },
            required: ["questions"]
          }
        },
        required: ["title", "description", "content", "quiz"]
      }
    },
    finalProject: {
      type: "OBJECT",
      properties: {
        title: { type: "STRING" },
        description: { type: "STRING" },
        requirements: { type: "ARRAY", items: { type: "STRING" } },
        deliverables: { type: "ARRAY", items: { type: "STRING" } },
        estimatedTime: { type: "STRING" }
      },
      required: ["title", "description", "requirements", "deliverables"]
    }
  },
  required: ["title", "description", "chapters", "finalProject"]
};

export async function POST(request) {
  try {
    const { title, summary, transcript, videoId, author, thumbnail } = await request.json();

    if (!title || !transcript) {
      return NextResponse.json({ error: "Title and transcript are required" }, { status: 400 });
    }

    if (!process.env.GEMINI_API_KEY) {
      return NextResponse.json({ error: "AI service not configured. Please add GEMINI_API_KEY to your environment." }, { status: 500 });
    }

    let session = null;
    let userEmail = "guest";

    try {
      const { getServerSession } = await import("@/lib/auth-server");
      session = await getServerSession();
      if (session?.user?.email) {
        userEmail = session.user.email;
      }
    } catch (authError) {
      console.warn("Auth not available, continuing as guest:", authError.message);
    }

    if (session?.user?.email) {
      try {
        const { canGenerateYouTubeCourse } = await import("@/lib/premium");
        const eligibility = await canGenerateYouTubeCourse(session.user.email);
        if (!eligibility.canGenerate) {
          return NextResponse.json(
            {
              error: eligibility.reason,
              isPremium: eligibility.isPremium,
              count: eligibility.count,
              needsUpgrade: !eligibility.isPremium,
            },
            { status: 403 }
          );
        }
      } catch (premiumError) {
        console.warn("Premium check failed, continuing:", premiumError.message);
      }
    }

    // Configure model to enforce valid JSON mapping natively
    const model = genAI.getGenerativeModel({
      model: "gemini-3.5-flash",
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: courseSchema,
      }
    });

    const prompt = `Create a comprehensive structured learning course derived from this educational YouTube video transcript.

Video Title: ${title}
Video Author: ${author || 'Unknown'}
Transcript Context: ${transcript.substring(0, 12000)}

Generate exactly 5-6 informative chapters testing real conceptual understanding. Formulate challenging multiple choice questions for each chapter quiz. Ensure the final project encapsulates the core practical application of the video text.`;

    const result = await model.generateContent(prompt);
    const text = result.response.text();

    let courseData = null;
    try {
      courseData = JSON.parse(text);
    } catch (parseError) {
      console.error("Native structural parse failed:", parseError.message, text);
      return NextResponse.json({
        error: "Failed to assemble course format securely. Please try again."
      }, { status: 500 });
    }

    if (courseData.chapters && Array.isArray(courseData.chapters)) {
      courseData.chapters = courseData.chapters.map((ch, index) => ({
        ...ch,
        number: ch.number || index + 1
      }));
    } else {
      courseData.chapters = [];
    }

    const courseId = `course-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const enhancedCourseData = {
      ...courseData,
      source: "youtube",
      videoId: videoId || "",
      videoTitle: title,
      videoAuthor: author || "Unknown",
      thumbnail: thumbnail || "",
      videoUrl: videoId ? `https://www.youtube.com/watch?v=${videoId}` : "",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      process: "completed",
      progress: 0,
      completedChapters: [],
      quizScores: {},
      exerciseProgress: {},
      enrolledAt: new Date().toISOString(),
      lastAccessedAt: new Date().toISOString()
    };

    let savedToDb = false;
    let finalCourseId = courseId;

    try {
      const { getAdminDb } = await import("@/lib/firebase-admin");
      const adminDb = getAdminDb();

      if (adminDb && session?.user?.email) {
        const docRef = await adminDb
          .collection("users")
          .doc(session.user.email)
          .collection("youtube-courses")
          .add(enhancedCourseData);

        finalCourseId = docRef.id;
        enhancedCourseData.id = finalCourseId;
        savedToDb = true;
        console.log("Course saved to Firebase with ID:", docRef.id);

        try {
          const { createNotification } = await import("@/lib/create-notification");
          await createNotification(adminDb, {
            userId: session.user.email,
            title: "New Course Ready!",
            body: `Your YouTube course "${courseData.title || title}" has been created and is ready to learn.`,
            type: "progress",
            link: `/youtube-course/${finalCourseId}`,
          });
        } catch (notifErr) {
          console.warn("Notification creation failed:", notifErr.message);
        }
      }
    } catch (dbError) {
      console.warn("Could not save to Firebase:", dbError.message);
    }

    try {
      const { storeCourse } = await import("@/lib/course-store");
      storeCourse(finalCourseId, enhancedCourseData);
      console.log("Course stored in temp store with ID:", finalCourseId);
    } catch (storeError) {
      console.warn("Could not store in temp store:", storeError.message);
    }

    return NextResponse.json({
      success: true,
      id: finalCourseId,
      ...enhancedCourseData,
      savedToDb
    });
  } catch (error) {
    console.error("Course generation error:", error);
    return NextResponse.json({
      error: error.message || "An unexpected error occurred"
    }, { status: 500 });
  }
}
