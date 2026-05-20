"use client";
import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import {
  PlaySquare, Loader2, BookOpen, CheckCircle, Crown, Sparkles,
  FileText, Brain, Target, Map, ChevronRight, AlertCircle,
  Youtube, Clock, User, ArrowRight, RefreshCw
} from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/auth";
import { PageBackground, GridPattern, PageHeader, ScrollReveal, HoverCard } from "@/components/ui/PageWrapper";
import { saveCourseOffline } from "@/lib/offline";
import ChatBot from "@/components/chat/ChatBot";

export default function YouTubeCourse() {
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState("");
  const [progressStep, setProgressStep] = useState(0);
  const [premiumStatus, setPremiumStatus] = useState({ isPremium: false, count: 0 });
  const [videoInfo, setVideoInfo] = useState(null);
  const [transcriptData, setTranscriptData] = useState(null);
  const [summaryData, setSummaryData] = useState(null);
  const [courseData, setCourseData] = useState(null);
  const [error, setError] = useState(null);
  const router = useRouter();
  const { user } = useAuth();

  const progressSteps = [
    { label: "Validating URL", icon: AlertCircle },
    { label: "Fetching Video Info", icon: Youtube },
    { label: "Extracting Transcript", icon: FileText },
    { label: "Analyzing Content", icon: Brain },
    { label: "Creating Chapter Summary", icon: BookOpen },
    { label: "Generating Course Content", icon: Sparkles },
    { label: "Adding Quizzes & Exercises", icon: Target },
    { label: "Building Learning Roadmap", icon: Map },
  ];

  useEffect(() => {
    const fetchPremiumStatus = async () => {
      if (user) {
        try {
          const res = await fetch("/api/premium/status");
          const data = await res.json();
          setPremiumStatus(data);

          const ytRes = await fetch("/api/youtube/status");
          if (ytRes.ok) {
            const ytData = await ytRes.json();
            setPremiumStatus(prev => ({ ...prev, count: ytData.count || 0 }));
          }
        } catch (error) {
          console.error("Error fetching premium status:", error);
        }
      }
    };
    fetchPremiumStatus();
  }, [user]);

  const validateYouTubeUrl = (url) => {
    const patterns = [
      /^(https?:\/\/)?(www\.)?youtube\.com\/watch\?v=[\w-]+/,
      /^(https?:\/\/)?(www\.)?youtu\.be\/[\w-]+/,
      /^(https?:\/\/)?(www\.)?youtube\.com\/embed\/[\w-]+/,
      /^(https?:\/\/)?(www\.)?youtube\.com\/shorts\/[\w-]+/,
    ];
    return patterns.some(pattern => pattern.test(url));
  };

  const generateCourse = async () => {
    if (!youtubeUrl) {
      toast.error("Please enter a YouTube URL");
      return;
    }

    if (!validateYouTubeUrl(youtubeUrl)) {
      toast.error("Please enter a valid YouTube URL");
      return;
    }

    setIsProcessing(true);
    setError(null);
    setVideoInfo(null);
    setTranscriptData(null);
    setSummaryData(null);
    setCourseData(null);
    setProgressStep(0);

    try {
      // Step 1: Validate and get video info
      setProgressStep(1);
      setProgress("Validating YouTube URL...");

      const infoResponse = await fetch("/api/youtube/info", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: youtubeUrl })
      });

      if (!infoResponse.ok) {
        const errorText = await infoResponse.text();
        let errorMessage = "Failed to fetch video information";
        try {
          const errorJson = JSON.parse(errorText);
          errorMessage = errorJson.error || errorMessage;
        } catch (e) {
          console.error("Non-JSON error response:", errorText.substring(0, 200));
        }
        throw new Error(errorMessage);
      }

      const videoInfoData = await infoResponse.json();
      setVideoInfo(videoInfoData);
      setProgressStep(2);
      setProgress(`Found: "${videoInfoData.title}"`);

      // Step 2: Extract transcript
      setProgressStep(3);
      setProgress("Extracting video transcript...");

      const transcriptResponse = await fetch("/api/youtube/transcript", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ videoId: videoInfoData.videoId })
      });

      const transcriptText = await transcriptResponse.text();
      let transcriptResult;
      try {
        transcriptResult = JSON.parse(transcriptText);
      } catch (e) {
        console.error("Non-JSON transcript response:", transcriptText.substring(0, 200));
        throw new Error("Transcript service returned an invalid response. Please try again.");
      }

      if (transcriptResult.error || !transcriptResult.transcript) {
        toast.warning(transcriptResult.error || "No transcript found. Using fallback method.");
        // We'll proceed with the fallback transcript generated by the API if available
        if (!transcriptResult.transcript) {
          throw new Error(transcriptResult.error || "This video has no accessible transcript.");
        }
      }

      setTranscriptData(transcriptResult);
      setProgressStep(4);
      setProgress(`Transcript extracted (${transcriptResult.transcript?.split(' ').length || 0} words)`);

      // Step 3: Analyze and create chapter summary
      setProgressStep(5);
      setProgress("Analyzing content and creating chapters...");

      const summarizeResponse = await fetch("/api/youtube/summarize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: videoInfoData.title,
          transcript: transcriptResult.transcript,
          timestampedTranscript: transcriptResult.timestampedTranscript,
          duration: transcriptResult.duration
        })
      });

      const summarizeText = await summarizeResponse.text();
      let summaryResult;
      try {
        summaryResult = JSON.parse(summarizeText);
      } catch (e) {
        console.error("Non-JSON summarize response:", summarizeText.substring(0, 200));
        throw new Error("Failed to analyze content. Please try again.");
      }
      setSummaryData(summaryResult);
      setProgressStep(6);
      setProgress(`Created ${summaryResult.chapters?.length || 0} chapters`);

      // Step 4: Generate full course with quizzes and exercises
      setProgressStep(7);
      setProgress("Generating comprehensive course content...");

      const courseResponse = await fetch("/api/youtube/generate-course", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: videoInfoData.title,
          summary: summaryResult,
          transcript: transcriptResult.transcript,
          videoId: videoInfoData.videoId,
          author: videoInfoData.author,
          thumbnail: videoInfoData.thumbnail
        })
      });

      const courseText = await courseResponse.text();
      let courseResult;
      try {
        courseResult = JSON.parse(courseText);
      } catch (e) {
        console.error("Non-JSON course response:", courseText.substring(0, 500));
        throw new Error("Course generation service returned an invalid response. Please check server logs.");
      }

      if (!courseResponse.ok) {
        if (courseResult.needsUpgrade) {
          toast.error(courseResult.error);
          router.push("/premium");
          return;
        }
        const fallbackMsg = typeof courseResult === 'string' ? courseResult : "Failed to generate course";
        throw new Error(courseResult.error || fallbackMsg);
      }
      setCourseData(courseResult);
      setProgressStep(8);
      setProgress("Course generated successfully!");

      // Step 5: Generate learning roadmap
      setProgress("Building your learning roadmap...");

      try {
        await fetch("/api/youtube/roadmap", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            courseId: courseResult.id,
            courseTitle: courseResult.title,
            courseDescription: courseResult.description,
            chapters: courseResult.chapters,
            difficulty: courseResult.difficulty,
            topics: courseResult.topics
          })
        });
      } catch (roadmapError) {
        console.error("Roadmap generation failed:", roadmapError);
        // Continue even if roadmap fails
      }

      toast.success("Course generated successfully!");

      // Save course to offline storage for persistence
      try {
        await saveCourseOffline(courseResult);
        console.log("Course saved to offline storage:", courseResult.id);
      } catch (offlineError) {
        console.warn("Failed to save to offline storage:", offlineError);
      }

      // Navigate to the course view
      setTimeout(() => {
        router.push(`/youtube-course/${courseResult.id}`);
      }, 1500);

    } catch (error) {
      console.error("Course generation error:", error);
      setError(error.message);
      toast.error(error.message || "Failed to generate course");
    } finally {
      setIsProcessing(false);
    }
  };

  const resetForm = () => {
    setYoutubeUrl("");
    setVideoInfo(null);
    setTranscriptData(null);
    setSummaryData(null);
    setCourseData(null);
    setError(null);
    setProgressStep(0);
    setProgress("");
  };

  return (
    <div className="min-h-screen bg-background p-6 relative">
      <PageBackground />
      <GridPattern opacity={0.02} />

      <div className="max-w-5xl mx-auto my-10 relative z-10">
        <PageHeader
          title="YouTube to Course Generator"
          description="Transform any YouTube video into a comprehensive, interactive learning course"
          icon={PlaySquare}
          iconColor="text-red-500"
          badge={<><Sparkles className="h-3.5 w-3.5" /> AI-Powered</>}
        />

        {/* Premium Banner */}
        {!premiumStatus.isPremium && (
          <ScrollReveal delay={100}>
            <div className="mb-6 p-5 bg-linear-to-r from-yellow-500/10 to-orange-500/10 border border-yellow-500/20 rounded-xl backdrop-blur-sm">
              <div className="flex items-start gap-3">
                <div className="shrink-0 w-10 h-10 bg-linear-to-br from-yellow-400 to-orange-500 rounded-full flex items-center justify-center shadow-lg shadow-yellow-500/25">
                  <Crown className="h-5 w-5 text-black" />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-lg mb-1">Free User Limit</h3>
                  <p className="text-sm text-muted-foreground mb-3">
                    Free users can generate 5 YouTube courses. You've used {premiumStatus.count || 0}/5. Upgrade to Premium for unlimited access!
                  </p>
                  <Button
                    onClick={() => router.push("/premium")}
                    className="bg-linear-to-r from-yellow-500 to-orange-500 hover:from-yellow-600 hover:to-orange-600 text-black transition-all duration-300 hover:scale-105"
                  >
                    Upgrade to Premium - ₹100/month
                  </Button>
                </div>
              </div>
            </div>
          </ScrollReveal>
        )}

        {/* Main Input Card */}
        <ScrollReveal delay={150}>
          <HoverCard>
            <Card className="bg-card/50 backdrop-blur-sm border-border/50 mb-6">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 mb-2">
                  <div className="w-10 h-10 rounded-xl bg-red-500/10 flex items-center justify-center">
                    <Youtube className="h-6 w-6 text-red-500" />
                  </div>
                  Enter YouTube URL
                </CardTitle>
                <CardDescription>
                  Paste a YouTube video link to generate a complete interactive course
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex gap-2">
                  <Input
                    value={youtubeUrl}
                    onChange={(e) => setYoutubeUrl(e.target.value)}
                    placeholder="https://www.youtube.com/watch?v=..."
                    disabled={isProcessing}
                    className="bg-background/50 flex-1"
                  />
                  <Button
                    onClick={generateCourse}
                    disabled={isProcessing}
                    className="bg-linear-to-r from-red-600 to-pink-600 hover:from-red-700 hover:to-pink-700 transition-all duration-300 min-w-40"
                  >
                    {isProcessing ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Processing
                      </>
                    ) : (
                      <>
                        <BookOpen className="h-4 w-4 mr-2" />
                        Generate Course
                      </>
                    )}
                  </Button>
                </div>

                {/* Video Preview */}
                {videoInfo && (
                  <div className="flex gap-4 p-4 bg-muted/30 rounded-xl border border-border/50">
                    <img
                      src={videoInfo.thumbnail}
                      alt="Video thumbnail"
                      className="w-40 h-24 object-cover rounded-lg"
                      onError={(e) => e.target.src = videoInfo.thumbnailFallback}
                    />
                    <div className="flex-1">
                      <h3 className="font-semibold line-clamp-2">{videoInfo.title}</h3>
                      {videoInfo.author && (
                        <p className="text-sm text-muted-foreground flex items-center gap-1 mt-1">
                          <User className="h-3 w-3" /> {videoInfo.author}
                        </p>
                      )}
                      {transcriptData && (
                        <Badge variant="outline" className="mt-2 bg-green-500/10 text-green-600 border-green-500/20">
                          <CheckCircle className="h-3 w-3 mr-1" /> Transcript Available
                        </Badge>
                      )}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </HoverCard>
        </ScrollReveal>

        {/* Progress Steps */}
        {isProcessing && (
          <ScrollReveal delay={200}>
            <Card className="bg-card/50 backdrop-blur-sm border-border/50 mb-6">
              <CardContent className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold">Course Generation Progress</h3>
                  <span className="text-sm text-muted-foreground">{progress}</span>
                </div>
                <Progress value={(progressStep / progressSteps.length) * 100} className="mb-6" />
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {progressSteps.map((step, index) => {
                    const Icon = step.icon;
                    const isCompleted = index < progressStep;
                    const isCurrent = index === progressStep;

                    return (
                      <div
                        key={index}
                        className={`flex items-center gap-2 p-3 rounded-lg transition-all ${isCompleted
                          ? 'bg-green-500/10 text-green-600'
                          : isCurrent
                            ? 'bg-primary/10 text-primary'
                            : 'bg-muted/30 text-muted-foreground'
                          }`}
                      >
                        {isCompleted ? (
                          <CheckCircle className="h-4 w-4" />
                        ) : isCurrent ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Icon className="h-4 w-4" />
                        )}
                        <span className="text-xs font-medium">{step.label}</span>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </ScrollReveal>
        )}

        {/* Error Display */}
        {error && (
          <ScrollReveal delay={200}>
            <Card className="bg-destructive/10 border-destructive/20 mb-6">
              <CardContent className="p-6">
                <div className="flex items-start gap-3">
                  <AlertCircle className="h-5 w-5 text-destructive mt-0.5" />
                  <div>
                    <h3 className="font-semibold text-destructive mb-1">Error Generating Course</h3>
                    <p className="text-sm text-muted-foreground">{error}</p>
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-3"
                      onClick={resetForm}
                    >
                      <RefreshCw className="h-4 w-4 mr-2" />
                      Try Again
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </ScrollReveal>
        )}

        {/* Course Preview */}
        {courseData && (
          <ScrollReveal delay={200}>
            <Card className="bg-card/50 backdrop-blur-sm border-border/50 mb-6">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2">
                    <CheckCircle className="h-5 w-5 text-green-500" />
                    Course Generated Successfully!
                  </CardTitle>
                  <Button onClick={() => router.push(`/youtube-course/${courseData.id}`)}>
                    View Course <ArrowRight className="h-4 w-4 ml-2" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div>
                    <h3 className="text-xl font-bold">{courseData.title}</h3>
                    <p className="text-muted-foreground mt-1">{courseData.description}</p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Badge variant="outline">
                      <BookOpen className="h-3 w-3 mr-1" /> {courseData.chapters?.length || 0} Chapters
                    </Badge>
                    <Badge variant="outline">
                      <Target className="h-3 w-3 mr-1" /> {courseData.chapters?.reduce((acc, ch) => acc + (ch.quiz?.questions?.length || 0), 0) || 0} Quiz Questions
                    </Badge>
                    <Badge variant="outline">
                      <Brain className="h-3 w-3 mr-1" /> {courseData.chapters?.reduce((acc, ch) => acc + (ch.exercises?.length || 0), 0) || 0} Exercises
                    </Badge>
                    <Badge variant="outline">
                      <Clock className="h-3 w-3 mr-1" /> {courseData.estimatedDuration || 'Self-paced'}
                    </Badge>
                    <Badge variant="outline" className="capitalize">
                      {courseData.difficulty || 'Intermediate'}
                    </Badge>
                  </div>

                  {/* Chapter List Preview */}
                  {courseData.chapters && courseData.chapters.length > 0 && (
                    <div className="mt-4">
                      <h4 className="font-semibold mb-2">Course Chapters:</h4>
                      <div className="space-y-2">
                        {courseData.chapters.slice(0, 5).map((chapter, index) => (
                          <div
                            key={index}
                            className="flex items-center gap-3 p-3 bg-muted/30 rounded-lg"
                          >
                            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-sm font-medium">
                              {chapter.number || index + 1}
                            </div>
                            <div className="flex-1">
                              <p className="font-medium text-sm">{chapter.title}</p>
                              <p className="text-xs text-muted-foreground">{chapter.duration || '15 min'}</p>
                            </div>
                            <ChevronRight className="h-4 w-4 text-muted-foreground" />
                          </div>
                        ))}
                        {courseData.chapters.length > 5 && (
                          <p className="text-sm text-muted-foreground text-center py-2">
                            +{courseData.chapters.length - 5} more chapters
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </ScrollReveal>
        )}

        {/* Features Info */}
        <ScrollReveal delay={250}>
          <Card className="bg-card/50 backdrop-blur-sm border-border/50">
            <CardHeader>
              <CardTitle className="text-lg">How It Works</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                {[
                  {
                    icon: FileText,
                    title: "Transcript Extraction",
                    description: "Automatically extracts and processes the video's transcript with timestamps"
                  },
                  {
                    icon: BookOpen,
                    title: "Chapter-wise Summary",
                    description: "Creates organized chapters with clear summaries and key concepts"
                  },
                  {
                    icon: Sparkles,
                    title: "In-depth Content",
                    description: "Generates comprehensive educational content for each chapter"
                  },
                  {
                    icon: Target,
                    title: "Quizzes & Exercises",
                    description: "Adds interactive quizzes and practical exercises for each chapter"
                  },
                  {
                    icon: Map,
                    title: "Learning Roadmap",
                    description: "Creates a complete learning path with milestones and goals"
                  },
                  {
                    icon: Brain,
                    title: "AI-Powered",
                    description: "Uses advanced AI to understand and structure the content effectively"
                  }
                ].map((feature, index) => {
                  const Icon = feature.icon;
                  return (
                    <div key={index} className="flex gap-3 p-3 rounded-lg bg-muted/20 hover:bg-muted/30 transition-colors">
                      <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                        <Icon className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <h4 className="font-medium text-sm">{feature.title}</h4>
                        <p className="text-xs text-muted-foreground mt-0.5">{feature.description}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </ScrollReveal>
      </div>
      <ChatBot />
    </div>
  );
}