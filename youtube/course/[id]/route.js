import { NextResponse } from "next/server";

export async function GET(request, { params }) {
  try {
    const courseId = params.id;
    let session = null;
    try {
      const { getServerSession } = await import("@/lib/auth-server");
      session = await getServerSession();
    } catch (authError) {
      console.warn("Auth not available:", authError.message);
    }
    try {
      const { getAdminDb } = await import("@/lib/firebase-admin");
      const adminDb = getAdminDb();

      if (adminDb && session?.user?.email) {
        const ytCourseDoc = await adminDb
          .collection("users")
          .doc(session.user.email)
          .collection("youtube-courses")
          .doc(courseId)
          .get();

        if (ytCourseDoc.exists) {
          const data = ytCourseDoc.data();
          return NextResponse.json({
            id: courseId,
            ...data,
            lastAccessedAt: new Date().toISOString()
          });
        }
        const roadmapDoc = await adminDb
          .collection("users")
          .doc(session.user.email)
          .collection("roadmaps")
          .doc(courseId)
          .get();

        if (roadmapDoc.exists) {
          const data = roadmapDoc.data();
          return NextResponse.json({
            id: courseId,
            ...data,
            lastAccessedAt: new Date().toISOString()
          });
        }
      }
    } catch (dbError) {
      console.warn("Firebase fetch failed:", dbError.message);
    }
    try {
      const { getCourse } = await import("@/lib/course-store");
      const courseData = getCourse(courseId);

      if (courseData) {
        return NextResponse.json({
          id: courseId,
          ...courseData,
          lastAccessedAt: new Date().toISOString()
        });
      }
    } catch (storeError) {
      console.warn("Temp store fetch failed:", storeError.message);
    }
    console.error("Course not found:", {
      courseId,
      hasSession: !!session,
      userEmail: session?.user?.email,
      timestamp: new Date().toISOString()
    });

    return NextResponse.json({
      error: "Course not found",
      courseId,
      message: "The course may have been generated but is no longer available. Please regenerate the course.",
      hint: "Courses are stored temporarily when Firebase is not configured. They may be lost on server restart."
    }, { status: 404 });
  } catch (error) {
    console.error("Error fetching course:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
export async function PUT(request, { params }) {
  try {
    const courseId = params.id;
    const updates = await request.json();
    try {
      const { getAdminDb } = await import("@/lib/firebase-admin");
      const { getServerSession } = await import("@/lib/auth-server");
      const adminDb = getAdminDb();
      const session = await getServerSession();

      if (adminDb && session?.user?.email) {
        const ytCourseRef = adminDb
          .collection("users")
          .doc(session.user.email)
          .collection("youtube-courses")
          .doc(courseId);

        const ytCourseDoc = await ytCourseRef.get();

        if (ytCourseDoc.exists) {
          const currentData = ytCourseDoc.data();
          const currentProgress = currentData.progress || 0;
          const newProgress = updates.progress || currentProgress;

          await ytCourseRef.update({
            ...updates,
            updatedAt: new Date().toISOString()
          });

          // Trigger course completion email if reached 100%
          if (newProgress === 100 && currentProgress < 100) {
            try {
              const { sendCourseCompletionEmail } = await import("@/lib/brevo");
              await sendCourseCompletionEmail(session.user.email, session.user.name, currentData.title || "Your YouTube Course");
            } catch (emailError) {
              console.error("Failed to send completion email:", emailError);
            }
          }

          return NextResponse.json({ success: true });
        }
      }
    } catch (dbError) {
      console.warn("Firebase update failed:", dbError.message);
    }
    try {
      const { updateCourse } = await import("@/lib/course-store");
      if (updateCourse(courseId, { ...updates, updatedAt: new Date().toISOString() })) {
        return NextResponse.json({ success: true });
      }
    } catch (storeError) {
      console.warn("Temp store update failed:", storeError.message);
    }

    return NextResponse.json({ error: "Course not found" }, { status: 404 });
  } catch (error) {
    console.error("Error updating course:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(request, { params }) {
  try {
    const courseId = params.id;
    try {
      const { getAdminDb } = await import("@/lib/firebase-admin");
      const { getServerSession } = await import("@/lib/auth-server");
      const adminDb = getAdminDb();
      const session = await getServerSession();

      if (adminDb && session?.user?.email) {
        const ytCourseRef = adminDb
          .collection("users")
          .doc(session.user.email)
          .collection("youtube-courses")
          .doc(courseId);

        const ytCourseDoc = await ytCourseRef.get();

        if (ytCourseDoc.exists) {
          await ytCourseRef.delete();
          return NextResponse.json({ success: true, message: "Course deleted" });
        }
      }
    } catch (dbError) {
      console.warn("Firebase delete failed:", dbError.message);
    }
    try {
      const { deleteCourse } = await import("@/lib/course-store");
      if (deleteCourse(courseId)) {
        return NextResponse.json({ success: true, message: "Course deleted" });
      }
    } catch (storeError) {
      console.warn("Temp store delete failed:", storeError.message);
    }

    return NextResponse.json({ error: "Course not found" }, { status: 404 });
  } catch (error) {
    console.error("Error deleting course:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}