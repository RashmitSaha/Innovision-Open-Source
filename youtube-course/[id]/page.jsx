"use client";
import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ArrowLeft, BookOpen, CheckCircle, Play, Target, Brain, Map,
  Clock, ChevronRight, ChevronDown, ChevronUp, Youtube, User,
  FileText, Award, TrendingUp, Calendar, Lightbulb, MessageSquare,
  Loader2, ExternalLink, CheckCircle2, Circle, X
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/auth";
import MarkDown from "@/components/MarkDown";
import { getOfflineCourses } from "@/lib/offline";
import ChatBot from "@/components/chat/ChatBot";

export default function YouTubeCourseView() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuth();
  const courseId = params.id;

  const [course, setCourse] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeChapter, setActiveChapter] = useState(null);
  const [quizAnswers, setQuizAnswers] = useState({});
  const [quizSubmitted, setQuizSubmitted] = useState(false);
  const [quizResults, setQuizResults] = useState(null);
  const [expandedSections, setExpandedSections] = useState({ content: true, quiz: false, exercises: false });

  useEffect(() => {
    fetchCourse();
  }, [courseId]);

  const fetchCourse = async () => {
    if (!courseId) return;

    try {
      const response = await fetch(`/api/youtube/course/${courseId}`);

      if (!response.ok) {
        // If API returns 404, try to get from offline storage
        if (response.status === 404) {
          console.log("Course not found on server, checking offline storage...");
          const offlineCourses = await getOfflineCourses();
          const offlineCourse = offlineCourses.find(c => c.id === courseId);

          if (offlineCourse) {
            console.log("Course found in offline storage");
            setCourse(offlineCourse);
            if (offlineCourse.chapters && offlineCourse.chapters.length > 0) {
              setActiveChapter(offlineCourse.chapters[0]);
            }
            setLoading(false);
            return;
          }
        }

        throw new Error("Failed to fetch course");
      }

      const data = await response.json();
      setCourse(data);
      if (data.chapters && data.chapters.length > 0) {
        setActiveChapter(data.chapters[0]);
      }
    } catch (error) {
      console.error("Error fetching course:", error);
      toast.error("Failed to load course");
    } finally {
      setLoading(false);
    }
  };

  const markChapterComplete = async (chapterNumber, completed = true) => {
    try {
      const response = await fetch("/api/youtube/roadmap", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ courseId, chapterNumber, completed })
      });

      const handleNextChapter = () => {
        if (!completed) return;
        const currentIndex = course.chapters.findIndex(c => c.number === chapterNumber);
        if (currentIndex !== -1 && currentIndex < course.chapters.length - 1) {
          const nextChapter = course.chapters[currentIndex + 1];
          setActiveChapter(nextChapter);
          setQuizAnswers({});
          setQuizSubmitted(false);
          setQuizResults(null);
        }
      };

      if (response.ok) {
        toast.success(completed ? "Chapter marked as complete!" : "Chapter marked as incomplete");
        setCourse(prev => ({
          ...prev,
          completedChapters: completed
            ? [...(prev.completedChapters || []), chapterNumber].sort((a, b) => a - b)
            : (prev.completedChapters || []).filter(ch => ch !== chapterNumber)
        }));

        if (completed) handleNextChapter();
      } else {

        const result = await response.json().catch(() => ({}));
        if (response.status === 503) {
          setCourse(prev => ({
            ...prev,
            completedChapters: completed
              ? [...(prev.completedChapters || []), chapterNumber].sort((a, b) => a - b)
              : (prev.completedChapters || []).filter(ch => ch !== chapterNumber)
          }));
          toast.success(completed ? "Chapter marked as complete!" : "Chapter marked as incomplete");
          if (completed) handleNextChapter();
        } else {
          toast.error(result.error || "Failed to update status");
        }
      }
    } catch (error) {
      console.error("Error updating chapter status:", error);
      toast.error("Failed to update status");
    }
  };

  const submitQuiz = async () => {
    if (!activeChapter?.quiz) return;

    const answers = activeChapter.quiz.questions.map((_, index) => quizAnswers[index]);
    if (answers.some(a => a === undefined)) {
      toast.error("Please answer all questions");
      return;
    }

    try {
      const response = await fetch("/api/youtube/quiz", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          courseId,
          chapterNumber: activeChapter.number,
          answers
        })
      });

      const result = await response.json();
      if (result.success) {
        setQuizResults(result);
        setQuizSubmitted(true);
        if (result.passed) {
          toast.success(`Quiz passed! Score: ${result.score}%`);
        } else {
          toast.error(`Quiz not passed. Score: ${result.score}%`);
        }
      } else if (response.status === 503) {
        // Firebase not configured - calculate score locally
        let correctCount = 0;
        const results = activeChapter.quiz.questions.map((question, index) => {
          const userAnswer = answers[index];
          const isCorrect = userAnswer === question.correctAnswer;
          if (isCorrect) correctCount++;
          return {
            questionId: question.id,
            question: question.question,
            userAnswer,
            correctAnswer: question.correctAnswer,
            isCorrect,
            explanation: question.explanation
          };
        });

        const score = Math.round((correctCount / activeChapter.quiz.questions.length) * 100);
        const passingScore = activeChapter.quiz.passingScore || 70;
        const passed = score >= passingScore;

        const localResult = {
          success: true,
          score,
          passed,
          results,
          correctCount,
          totalQuestions: activeChapter.quiz.questions.length
        };

        setQuizResults(localResult);
        setQuizSubmitted(true);
        if (passed) {
          toast.success(`Quiz passed! Score: ${score}%`);
        } else {
          toast.error(`Quiz not passed. Score: ${score}%`);
        }
      } else {
        toast.error(result.error || "Failed to submit quiz");
      }
    } catch (error) {
      console.error("Error submitting quiz:", error);
      toast.error("Failed to submit quiz");
    }
  };

  const toggleSection = (section) => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!course) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4">
        <h2 className="text-xl font-semibold">Course not found</h2>
        <Button onClick={() => router.push("/youtube-course")}>
          <ArrowLeft className="h-4 w-4 mr-2" /> Back to Generator
        </Button>
      </div>
    );
  }

  const completedChapters = course.completedChapters || [];
  const progress = course.chapters?.length > 0
    ? Math.min(100, Math.round((completedChapters.length / course.chapters.length) * 100))
    : 0;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button variant="ghost" size="sm" onClick={() => router.push("/youtube-course")}>
                <ArrowLeft className="h-4 w-4 mr-2" /> Back
              </Button>
              <div>
                <h1 className="text-xl font-bold line-clamp-1">{course.title}</h1>
                <div className="flex items-center gap-3 text-sm text-muted-foreground">
                  {course.videoAuthor && (
                    <span className="flex items-center gap-1">
                      <User className="h-3 w-3" /> {course.videoAuthor}
                    </span>
                  )}
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" /> {course.estimatedDuration || 'Self-paced'}
                  </span>
                  <Badge variant="outline" className="capitalize">{course.difficulty}</Badge>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="text-right">
                <p className="text-sm font-medium">{progress}% Complete</p>
                <Progress value={progress} className="w-32 h-2" />
              </div>
              {course.videoUrl && (
                <Button variant="outline" size="sm" asChild>
                  <a href={course.videoUrl} target="_blank" rel="noopener noreferrer">
                    <Youtube className="h-4 w-4 mr-2" /> Watch Original
                  </a>
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-6">
        <div className="grid lg:grid-cols-4 gap-6">
          {/* Sidebar - Chapter List */}
          <div className="lg:col-span-1">
            <Card className="bg-card/50 backdrop-blur-sm sticky top-24">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Course Content</CardTitle>
                <CardDescription>
                  {completedChapters.length} of {course.chapters?.length || 0} completed
                </CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <div className="max-h-[calc(100vh-300px)] overflow-y-auto">
                  {(course.chapters || []).map((chapter, index) => {
                    const chapterNum = chapter?.number || index + 1;
                    const isCompleted = completedChapters.includes(chapterNum);
                    const isActive = activeChapter?.number === chapterNum;

                    return (
                      <button
                        key={`chapter-${chapterNum}-${index}`}
                        onClick={() => {
                          setActiveChapter(chapter);
                          setQuizAnswers({});
                          setQuizSubmitted(false);
                          setQuizResults(null);
                        }}
                        className={`w-full flex items-center gap-3 p-4 text-left border-b transition-colors ${isActive
                          ? 'bg-primary/10 border-l-4 border-l-primary'
                          : 'hover:bg-muted/50 border-l-4 border-l-transparent'
                          }`}
                      >
                        <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${isCompleted
                          ? 'bg-green-500 text-white'
                          : 'bg-muted text-muted-foreground'
                          }`}>
                          {isCompleted ? (
                            <CheckCircle2 className="h-4 w-4" />
                          ) : (
                            <span className="text-xs">{chapterNum}</span>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className={`text-sm font-medium truncate ${isActive ? 'text-primary' : ''}`}>
                            {chapter?.title || `Chapter ${chapterNum}`}
                          </p>
                          <p className="text-xs text-muted-foreground">{chapter?.duration || '15 min'}</p>
                        </div>
                        {chapter?.quiz && (
                          <Target className="h-4 w-4 text-muted-foreground" />
                        )}
                      </button>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Main Content */}
          <div className="lg:col-span-3 space-y-6">
            {activeChapter ? (
              <>
                {/* Chapter Header */}
                <Card className="bg-card/50 backdrop-blur-sm">
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div>
                        <Badge variant="outline" className="mb-2">
                          Chapter {activeChapter.number}
                        </Badge>
                        <CardTitle>{activeChapter.title}</CardTitle>
                        <CardDescription className="mt-2">
                          {activeChapter.description}
                        </CardDescription>
                      </div>
                      {completedChapters.includes(activeChapter.number) ? (
                        <Button variant="outline" onClick={() => markChapterComplete(activeChapter.number, false)}>
                          <CheckCircle2 className="h-4 w-4 mr-2" /> Completed
                        </Button>
                      ) : (
                        <Button onClick={() => markChapterComplete(activeChapter.number, true)}>
                          <CheckCircle className="h-4 w-4 mr-2" /> Mark Complete
                        </Button>
                      )}
                    </div>
                  </CardHeader>
                </Card>

                {/* Chapter Content */}
                {activeChapter.content && (
                  <Card className="bg-card/50 backdrop-blur-sm">
                    <button
                      onClick={() => toggleSection('content')}
                      className="w-full p-4 flex items-center justify-between hover:bg-muted/30 transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        <BookOpen className="h-5 w-5 text-primary" />
                        <span className="font-semibold">Chapter Content</span>
                      </div>
                      {expandedSections.content ? <ChevronUp /> : <ChevronDown />}
                    </button>
                    {expandedSections.content && (
                      <CardContent className="pt-0 border-t">
                        <div className="prose prose-sm dark:prose-invert max-w-none py-4">
                          {activeChapter.content.introduction && (
                            <div className="mb-4 p-4 bg-primary/5 rounded-lg">
                              <p className="text-sm font-medium text-primary mb-1">Introduction</p>
                              <p className="text-muted-foreground">{activeChapter.content.introduction}</p>
                            </div>
                          )}
                          {activeChapter.content.mainContent && (
                            <MarkDown content={activeChapter.content.mainContent} />
                          )}
                          {activeChapter.content.keyPoints && Array.isArray(activeChapter.content.keyPoints) && (
                            <div className="mt-6 p-4 bg-muted/30 rounded-lg">
                              <p className="font-semibold mb-2 flex items-center gap-2">
                                <Lightbulb className="h-4 w-4 text-yellow-500" /> Key Points
                              </p>
                              <ul className="space-y-2">
                                {activeChapter.content.keyPoints.map((point, i) => (
                                  <li key={`keypoint-${i}`} className="flex items-start gap-2 text-sm">
                                    <CheckCircle className="h-4 w-4 text-green-500 mt-0.5 shrink-0" />
                                    {point}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                          {activeChapter.content.examples && Array.isArray(activeChapter.content.examples) && (
                            <div className="mt-4">
                              <p className="font-semibold mb-2">Examples</p>
                              {activeChapter.content.examples.map((example, i) => (
                                <div key={`example-${i}`} className="p-3 bg-blue-500/10 rounded-lg mb-2 text-sm">
                                  {example}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </CardContent>
                    )}
                  </Card>
                )}

                {/* Quiz Section */}
                {activeChapter.quiz && (
                  <Card className="bg-card/50 backdrop-blur-sm">
                    <button
                      onClick={() => toggleSection('quiz')}
                      className="w-full p-4 flex items-center justify-between hover:bg-muted/30 transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        <Target className="h-5 w-5 text-orange-500" />
                        <span className="font-semibold">{activeChapter.quiz.title || 'Chapter Quiz'}</span>
                        {quizSubmitted && quizResults?.passed && (
                          <Badge className="bg-green-500 ml-2">Passed</Badge>
                        )}
                      </div>
                      {expandedSections.quiz ? <ChevronUp /> : <ChevronDown />}
                    </button>
                    {expandedSections.quiz && (
                      <CardContent className="pt-0 border-t">
                        <div className="py-4 space-y-6">
                          {activeChapter.quiz.questions?.map((question, qIndex) => (
                            <div key={`q-${qIndex}`} className="space-y-3">
                              <p className="font-medium">
                                {qIndex + 1}. {question.question}
                              </p>
                              <div className="grid gap-2">
                                {(question.options || []).map((option, oIndex) => {
                                  const isSelected = quizAnswers[qIndex] === oIndex;
                                  const showResult = quizSubmitted && quizResults;
                                  let optionClass = "p-3 rounded-lg border cursor-pointer transition-colors";

                                  if (showResult) {
                                    if (oIndex === question.correctAnswer) {
                                      optionClass += " bg-green-500/20 border-green-500";
                                    } else if (isSelected) {
                                      optionClass += " bg-red-500/20 border-red-500";
                                    }
                                  } else if (isSelected) {
                                    optionClass += " bg-primary/10 border-primary";
                                  }

                                  return (
                                    <div
                                      key={`q-${qIndex}-opt-${oIndex}`}
                                      onClick={() => !quizSubmitted && setQuizAnswers(prev => ({ ...prev, [qIndex]: oIndex }))}
                                      className={optionClass}
                                    >
                                      <span className="text-sm">{option}</span>
                                    </div>
                                  );
                                })}
                              </div>
                              {quizSubmitted && quizResults && question.explanation && (
                                <p className="text-sm text-muted-foreground p-3 bg-muted/30 rounded-lg">
                                  <strong>Explanation:</strong> {question.explanation}
                                </p>
                              )}
                            </div>
                          ))}

                          {!quizSubmitted ? (
                            <Button onClick={submitQuiz} className="w-full">
                              Submit Quiz
                            </Button>
                          ) : (
                            <div className="flex gap-3">
                              <Button
                                variant="outline"
                                className="flex-1"
                                onClick={() => {
                                  setQuizSubmitted(false);
                                  setQuizAnswers({});
                                  setQuizResults(null);
                                }}
                              >
                                Retry Quiz
                              </Button>
                              {quizResults && (
                                <div className="flex items-center gap-2 px-4">
                                  <span className="text-sm">Score:</span>
                                  <span className={`font-bold ${quizResults.passed ? 'text-green-500' : 'text-red-500'}`}>
                                    {quizResults.score}%
                                  </span>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </CardContent>
                    )}
                  </Card>
                )}

                {/* Exercises Section */}
                {activeChapter.exercises && activeChapter.exercises.length > 0 && (
                  <Card className="bg-card/50 backdrop-blur-sm">
                    <button
                      onClick={() => toggleSection('exercises')}
                      className="w-full p-4 flex items-center justify-between hover:bg-muted/30 transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        <Brain className="h-5 w-5 text-purple-500" />
                        <span className="font-semibold">Exercises ({activeChapter.exercises.length})</span>
                      </div>
                      {expandedSections.exercises ? <ChevronUp /> : <ChevronDown />}
                    </button>
                    {expandedSections.exercises && (
                      <CardContent className="pt-0 border-t">
                        <div className="py-4 space-y-4">
                          {(activeChapter.exercises || []).map((exercise, eIndex) => (
                            <div key={`exercise-${eIndex}`} className="p-4 bg-muted/30 rounded-lg">
                              <div className="flex items-start justify-between mb-2">
                                <div>
                                  <Badge variant="outline" className="capitalize mb-2">
                                    {exercise?.type || 'Practice'}
                                  </Badge>
                                  <h4 className="font-medium">{exercise?.title || `Exercise ${eIndex + 1}`}</h4>
                                </div>
                                <Badge variant="secondary" className="capitalize">
                                  {exercise?.difficulty || 'Medium'}
                                </Badge>
                              </div>
                              <p className="text-sm text-muted-foreground mb-3">
                                {exercise?.description}
                              </p>
                              {exercise?.instructions && Array.isArray(exercise.instructions) && (
                                <div className="mb-3">
                                  <p className="text-sm font-medium mb-1">Instructions:</p>
                                  <ol className="list-decimal list-inside text-sm text-muted-foreground space-y-1">
                                    {exercise.instructions.map((inst, i) => (
                                      <li key={`inst-${eIndex}-${i}`}>{inst}</li>
                                    ))}
                                  </ol>
                                </div>
                              )}
                              {exercise?.hints && Array.isArray(exercise.hints) && (
                                <div className="p-2 bg-yellow-500/10 rounded text-sm">
                                  <strong>Hints:</strong> {exercise.hints.join(' • ')}
                                </div>
                              )}
                              <div className="flex items-center gap-2 mt-3 text-xs text-muted-foreground">
                                <Clock className="h-3 w-3" />
                                {exercise?.estimatedTime || '15 minutes'}
                              </div>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    )}
                  </Card>
                )}
              </>
            ) : (
              <Card className="bg-card/50 backdrop-blur-sm p-12 text-center">
                <BookOpen className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold mb-2">Select a Chapter</h3>
                <p className="text-muted-foreground">Choose a chapter from the sidebar to start learning</p>
              </Card>
            )}

            {/* Learning Roadmap */}
            {course.roadmap && (
              <Card className="bg-card/50 backdrop-blur-sm">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Map className="h-5 w-5 text-primary" />
                    Learning Roadmap
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {(course.roadmap.learningPath || []).map((phase, index) => {
                      const phaseChapters = phase?.chapters || [];
                      const completedInPhase = phaseChapters.filter(ch => completedChapters.includes(ch));
                      const phaseProgress = phaseChapters.length > 0
                        ? Math.min(100, Math.round((completedInPhase.length / phaseChapters.length) * 100))
                        : 0;

                      return (
                        <div key={`phase-${index}`} className="p-4 bg-muted/30 rounded-lg">
                          <div className="flex items-center justify-between mb-2">
                            <div>
                              <Badge variant="outline">Phase {phase?.phase || index + 1}</Badge>
                              <h4 className="font-medium mt-1">{phase?.title || `Phase ${index + 1}`}</h4>
                            </div>
                            <span className="text-sm text-muted-foreground">{phaseProgress}%</span>
                          </div>
                          <Progress value={phaseProgress} className="h-2 mb-2" />
                          <p className="text-sm text-muted-foreground">{phase?.description}</p>
                          <div className="flex flex-wrap gap-1 mt-2">
                            {(phase?.objectives || []).map((obj, i) => (
                              <Badge key={`obj-${index}-${i}`} variant="secondary" className="text-xs">{obj}</Badge>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {course.roadmap.nextSteps && (
                    <div className="mt-6 p-4 bg-primary/5 rounded-lg">
                      <h4 className="font-semibold mb-3">Next Steps After This Course</h4>
                      <div className="grid md:grid-cols-2 gap-4">
                        {course.roadmap.nextSteps.relatedCourses && Array.isArray(course.roadmap.nextSteps.relatedCourses) && (
                          <div>
                            <p className="text-sm font-medium mb-1">Related Courses</p>
                            <ul className="text-sm text-muted-foreground space-y-1">
                              {course.roadmap.nextSteps.relatedCourses.map((relatedCourse, i) => (
                                <li key={`related-${i}`} className="flex items-center gap-2">
                                  <ChevronRight className="h-3 w-3" /> {relatedCourse}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {course.roadmap.nextSteps.careerPaths && Array.isArray(course.roadmap.nextSteps.careerPaths) && (
                          <div>
                            <p className="text-sm font-medium mb-1">Career Paths</p>
                            <ul className="text-sm text-muted-foreground space-y-1">
                              {course.roadmap.nextSteps.careerPaths.map((path, i) => (
                                <li key={`path-${i}`} className="flex items-center gap-2">
                                  <TrendingUp className="h-3 w-3" /> {path}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Final Project */}
            {course.finalProject && (
              <Card className="bg-card/50 backdrop-blur-sm">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Award className="h-5 w-5 text-yellow-500" />
                    Capstone Project
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <h4 className="font-semibold mb-2">{course.finalProject.title || 'Final Project'}</h4>
                  <p className="text-muted-foreground mb-4">{course.finalProject.description}</p>

                  <div className="grid md:grid-cols-2 gap-4">
                    <div>
                      <p className="font-medium mb-2">Requirements</p>
                      <ul className="space-y-1">
                        {(course.finalProject.requirements || []).map((req, i) => (
                          <li key={`req-${i}`} className="flex items-start gap-2 text-sm">
                            <CheckCircle className="h-4 w-4 text-green-500 mt-0.5" />
                            {req}
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div>
                      <p className="font-medium mb-2">Deliverables</p>
                      <ul className="space-y-1">
                        {(course.finalProject.deliverables || []).map((del, i) => (
                          <li key={`del-${i}`} className="flex items-start gap-2 text-sm">
                            <FileText className="h-4 w-4 text-blue-500 mt-0.5" />
                            {del}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>

                  <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
                    <Clock className="h-4 w-4" />
                    Estimated time: {course.finalProject.estimatedTime || '2-3 hours'}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
      <ChatBot courseId={courseId} courseTitle={course?.title} />
    </div>
  );
}