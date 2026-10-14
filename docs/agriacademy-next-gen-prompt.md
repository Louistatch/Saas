# AGRIACADEMY NEXT-GEN — World-Class Interactive Learning Platform

**Projet :** `Louistatch/Saas`  
**Produit :** FaîtiereHub — AgriAcademy  
**Destinataire :** Claude Code  
**Référence qualitative :** WorldQuant University (WQU)  
**Objectif :** une plateforme de formation fiable, exigeante, immersive, mobile-first, avec UI/UX haut de gamme, animations utiles et exercices interactifs en React Three Fiber.

> **Instructions d'utilisation :** ouvre le dépôt `Louistatch/Saas` dans Claude Code, joins ce document et demande-lui d'exécuter les jalons dans l'ordre. Aucune fusion ou mise en production sans ton approbation.

---

# PROMPT MASTER — AGRIACADEMY NEXT-GEN

## 1. YOUR ROLE

You are a multidisciplinary engineering and educational design team composed of:

1. Principal EdTech Software Architect
2. Senior Learning Experience Designer
3. University Curriculum Designer
4. Senior React / Next.js Engineer
5. Senior React Three Fiber Engineer
6. Senior UI/UX Product Designer
7. Motion Design Engineer
8. Senior Supabase / PostgreSQL Engineer
9. Learning Assessment Specialist
10. Accessibility and Mobile UX Expert
11. Security and Data Privacy Engineer
12. QA Automation Engineer

Your mission is to elevate AgriAcademy from a basic course interface into a professional interactive learning system.

The result must be comparable in educational rigor and overall product quality to leading international online universities.

Do not copy WorldQuant University's proprietary design, branding, courses or source code. Study its publicly documented educational model and apply the relevant principles.

**Project:** `Louistatch/Saas`  
**Product:** FaîtiereHub — AgriAcademy  
**Stack:** Next.js, React 19, TypeScript, Tailwind CSS, React Three Fiber, Three.js, Drei, Rapier (where justified), Supabase/PostgreSQL, WebGL, Motion/CSS animations, Playwright.  
**Language:** French-first, extensible multilingual support.  
**Market:** Togo and West Africa.

## 2. ABSOLUTE PRIORITY

**THE PLATFORM MUST WORK BEFORE IT LOOKS IMPRESSIVE.**

Do not begin by adding decorative animations. First repair the learning lifecycle.

```text
REGISTER
   ↓
ACCESS TRAINING
   ↓
OPEN A LESSON
   ↓
STUDY THE CONTENT
   ↓
COMPLETE AN EXERCISE
   ↓
RECEIVE FEEDBACK
   ↓
PASS AN ASSESSMENT
   ↓
SAVE PROGRESS
   ↓
COMPLETE A MODULE
   ↓
REACH THE NEXT REQUIRED STAGE
```

Every stage must produce a verifiable, persistent and authorized state transition.

Progress must survive page refresh, browser restart, session renewal, device change and network interruption after successful save.

The learner must never see « À commencer » after successfully completing a lesson. The administration must see accurate progress.

## 3. START WITH THE EXISTING AUDIT

The following audit already exists:

`investor-readiness/technical-audit-parcours-operateur.md`

- Branch: `audit/parcours-operateur-formation`
- Audit commit: `7dc364a`

Read this document entirely before modifying code.

Compare the audit's findings with the current `main` branch. Some problems may already have been fixed. Verify each issue rather than blindly reimplementing the audit recommendations.

Inspect the existing code, including:

```text
app/operator/training/
app/operator/training/[lessonId]/
app/api/academy/operator/
app/admin/partners/training/
lib/academy/operator-training.ts
lib/partners/certification.ts
lib/security/assert-partner-access.ts
components/operator/
components/operator/journey.tsx
```

Also inspect the general AgriAcademy functionality for other user roles, existing Supabase academy migrations, database types, policies and tests.

Do not assume operator training and cooperative-member training have identical identities or permissions. They should share appropriate learning components without weakening access controls.

## 4. FIRST DELIVERABLE: TECHNICAL GAP ANALYSIS

Before implementation, create a concise report showing:

`CURRENT STATE / EXPECTED BEHAVIOR / ACTUAL BEHAVIOR / ROOT CAUSE / SEVERITY / RECOMMENDED FIX / DEPENDENCIES / SECURITY RISKS / TEST STRATEGY`

Specifically verify these audit findings:

- **C1:** Progress never saved.
- **C2:** No reliable automatic transition after required training is completed.
- **E1:** Required assignments cannot be reviewed.
- **E2:** 70% passing threshold is effectively 100% with three equally weighted questions.
- **E3:** Twelve educational screenshots missing.
- **E4:** Long-form lesson content not displayed.
- **M1:** Empty quiz submission possible.
- **M2:** Operator dashboard progress is misleading.
- **M3:** IP-based rate limiting interferes with classroom training.
- **M4:** Training discovery is poor.
- **M5:** Suspended operators retain access.
- **M6:** Super admins can create learner records without being legitimate candidates.
- **F1–F5:** Additional security, assessment and testing problems.

Do not rely on the historical database counts as current metrics. Recheck authorized data in read-only mode if the required access is available.

## 5. EDUCATIONAL MODEL INSPIRED BY WQU

Build a rigorous learning experience:

```text
LEARNING OBJECTIVES
   ↓
CONCEPT EXPLANATION
   ↓
VISUAL DEMONSTRATION
   ↓
GUIDED PRACTICE
   ↓
INTERACTIVE EXERCISE
   ↓
KNOWLEDGE CHECK
   ↓
PRACTICAL ASSIGNMENT
   ↓
FEEDBACK
   ↓
MASTERY VALIDATION
   ↓
NEXT LESSON
```

Use these educational principles:

- Active learning
- Learning by doing
- Mastery-based progression
- Scaffolding
- Formative assessment
- Immediate feedback
- Authentic assessment
- Learning objectives alignment
- Spaced revision where useful
- Competency-based certification

Research current best practices from recognized educational institutions. Investigate WorldQuant University, MIT OpenCourseWare, Harvard online learning resources, Moodle, Open edX, H5P, learning analytics standards, xAPI, SCORM and LTI.

Do not implement all these technologies. Assess their relevance to the existing system. Choose the smallest maintainable architecture that achieves the intended learning experience.

## 6. REDESIGN THE AGRIACADEMY UI/UX

The existing presentation is insufficient. I want a **premium educational interface**.

Visual direction:

**MODERN UNIVERSITY + INTERACTIVE DIGITAL LAB + AFRICAN AGRICULTURAL TECHNOLOGY**

Avoid generic admin-dashboard appearance, endless stacked cards, empty course screens, excessive whitespace, childish illustrations, decorative 3D without learning value, overloaded dashboards, inconsistent typography, excessive animation and AI-generated-looking visual clutter.

Create a coherent design system featuring:

- Professional typography
- Clear information hierarchy
- Carefully controlled spacing
- Elegant course cards
- Beautiful progress indicators
- Interactive timelines
- Premium microinteractions
- Smooth page transitions
- Meaningful status animations
- Professional color palette
- Responsive navigation
- Accessible controls
- Consistent component patterns

The UI must be excellent on desktop, laptop, tablet and Android smartphone. **MOBILE FIRST.**

The primary user may be learning on a low-bandwidth mobile connection. The course must remain usable without WebGL.

## 7. AGRIACADEMY STUDENT DASHBOARD

Create an advanced learning dashboard. The learner should immediately understand:

- What am I learning?
- How much have I completed?
- What is my next activity?
- What skills have I acquired?
- What is preventing completion?
- What assessments remain?
- What should I revise?

Proposed structure:

```text
AGRIACADEMY
│
├── MY LEARNING
│   ├── Current Courses
│   ├── Resume Learning
│   ├── Learning Timeline
│   └── Progress Overview
│
├── COURSE LIBRARY
│   ├── Available Courses
│   ├── Learning Paths
│   ├── Skills
│   └── Prerequisites
│
├── INTERACTIVE LABS
│   ├── Guided Simulations
│   ├── Interactive Demonstrations
│   ├── Practice Exercises
│   └── Case Studies
│
├── ASSESSMENTS
│   ├── Practice Quizzes
│   ├── Graded Quizzes
│   ├── Assignments
│   ├── Feedback
│   └── Results
│
├── ACHIEVEMENTS
│   ├── Competencies
│   ├── Completed Modules
│   ├── Certificates
│   └── Learning History
│
└── PROFILE
    ├── Learning Preferences
    ├── Accessibility
    └── Personal Progress
```

These are functional concepts. Reuse existing routes and entities whenever appropriate. Do not create an unrelated second LMS.

## 8. PREMIUM COURSE PLAYER

Create a professional course interface.

**Desktop layout:**

- **LEFT SIDEBAR:** course chapters, lessons, completion indicators, current lesson, locked and unlocked activities.
- **CENTER:** main lesson content, video or animation, 3D simulation where relevant, interactive exercises, explanations, case studies.
- **RIGHT PANEL (when useful):** learning objectives, notes, glossary, resources, progress, assessment information.

**Mobile:** use a compact adaptive layout. Course navigation must remain accessible without permanently consuming screen space.

Important actions: `PREVIOUS LESSON / NEXT LESSON / MARK LEARNING ACTIVITY / PRACTICE / TAKE QUIZ / VIEW FEEDBACK / RESUME`.

The platform should remember the learner's last meaningful learning position. Implement server-validated completion. Do not mark a lesson complete merely because the page was opened or the learner scrolled to the bottom.

## 9. ADVANCED REACT THREE FIBER LEARNING

This is a major innovation opportunity. Create a reusable **AGRIACADEMY INTERACTIVE 3D LAB ENGINE**.

Use React Three Fiber, Three.js, Drei, GLB/glTF and Rapier **only where physical interactions materially improve the exercise**.

Research advanced R3F capabilities:

- Suspense-based asset loading
- `useGLTF`
- `useAnimations`
- `OrbitControls`
- `PresentationControls`
- `Html`
- `Environment`
- `ContactShadows`
- `PerformanceMonitor`
- Instancing
- Adaptive quality
- On-demand rendering
- Asset caching
- GPU lifecycle management

Verify API availability against the installed stable dependency versions. Do not blindly upgrade to experimental releases. Do not add heavy 3D packages without measuring their impact.

## 10. INTERACTIVE 3D LEARNING SCENARIOS

The simulations must teach actual skills. Do not add random rotating objects. Create a reusable simulation framework supporting multiple practical exercises.

### Scenario A — Digital farmer registration

A learner enters a simulated cooperative office. They interact with a registration workstation and practice creating a farmer profile, identifying missing data, checking information, preventing duplicate records and respecting data confidentiality.

Use fictional training data only. The exercise must produce an objectively assessable result.

### Scenario B — Digital membership card

Show a 3D card in an interactive viewer. Allow the learner to examine member identity, QR code, organization, status and verification process; then present practical validation exercises.

### Scenario C — Cooperative data quality

Create a visual simulation where the learner identifies duplicate records, missing fields, incorrect locations, inconsistent records and unauthorized modifications.

### Scenario D — Kobo data collection

Simulate a data collection process: questionnaire, required fields, validation rules, data synchronization and quality assurance.

### Scenario E — Operator ethics and security

Use decision-based interactive scenarios. The learner must identify unauthorized access, privacy violations, improper use of member data, misleading commercial promises and incorrect certification claims. Use branching decisions with feedback.

### Scenario F — Cooperative dashboard

Create an interactive demonstration of cooperative management: members, organizations, digital cards, activity indicators and data access permissions.

**IMPORTANT:** The initial twelve operator lessons already exist in the database. Map the proposed simulations to their actual learning objectives. Do not force every lesson to contain 3D. Use 3D only when it improves comprehension. Every 3D exercise must provide a non-3D accessible alternative.

## 11. OBJECT-ORIENTED ARCHITECTURE

Use clean, modular TypeScript architecture. Apply relevant principles:

- Single Responsibility
- Dependency Inversion
- Interface Segregation
- Explicit domain models
- Testable business rules
- Separation of concerns

Do not overengineer. React presentation should remain declarative and favor component composition. OOP is appropriate for domain services and stateful simulation controllers when it provides clear benefits.

Suggested domain contracts:

```text
LearningModule
LearningLesson
LearningActivity
LearningProgress
QuizAttempt
AssessmentPolicy
AssignmentSubmission
AssignmentReview
CertificationEligibility
SimulationScenario
SimulationAction
LearningAnalyticsEvent
```

Design interfaces such as `ProgressRepository`, `AssessmentService`, `AssignmentReviewService`, `LearningPathService`, `CertificationService`, and `SimulationEngine` when justified.

Check which entities and services already exist in the codebase. Extend the current architecture. Do not introduce duplicate domain models with conflicting sources of truth. Server-side business rules must remain independent from UI components. The client must never determine its own certified status.

## 12. FIX LEARNING PROGRESS CORRECTLY

**CRITICAL REQUIREMENT.**

When a learner legitimately opens a lesson, record the start of learning through an authorized server operation. When an assessment is completed, evaluate the answers on the server. When all required completion conditions are satisfied, persist the resulting lesson state.

Progression must be:

- Idempotent
- Authorized
- Persistent
- Transactionally consistent
- Resistant to duplicate requests
- Safe under concurrent submissions
- Auditable

Protect against forged completion requests, cross-account writes, cross-organization writes, duplicate submissions, unauthorized status transitions, inconsistent timestamps and lost updates.

Audit the existing progress endpoint. **Do not trust a client-submitted `status="completed"` or `progressPercent=100` as proof of actual completion.** Derive completion from authoritative server-side assessment records.

Preserve the first `started_at` timestamp and the real `completed_at` timestamp. Never replace historical timestamps on every page visit.

Avoid incomplete multi-step transactions between progress, certification and notifications. Use a secure transactional design when multiple records must change together.

## 13. ADVANCED QUIZ ENGINE

Replace the current simplistic assessment experience with a rigorous quiz system.

Support single choice, multiple choice, true/false, case study, scenario-based questions and short-answer questions **where review exists**.

Requirements:

- One clear question at a time when appropriate
- Visible progress
- Accessible answer selection
- Confirmation before final submission
- Prevention of empty answers
- Server-side grading
- Detailed post-submission feedback
- Explanations
- Review of incorrect answers
- Attempt history
- Configurable passing thresholds
- Configurable attempt limits
- Formative vs summative assessment

Do not expose correct answers before a graded attempt.

Resolve the current threshold defect: a 70% threshold with three equally weighted questions does not permit a 70% passing score.

Propose at least five meaningful questions for each graded lesson quiz, where pedagogically justified. Do not invent filler questions. Ensure multiple-choice questions contain valid distractors.

Implement partial credit only under an explicit, mathematically documented rule. Do not award points for selecting every possible option.

For manually graded questions, use a pending-review state. Do not automatically assign zero points and treat that as a final grade.

## 14. PRACTICAL ASSIGNMENTS

The existing twelve practical assignments are currently required but cannot be reviewed. This must be resolved.

**Learner workflow:** read assignment instructions, view assessment criteria, prepare the response, submit, see submission status, receive feedback and resubmit if authorized.

**Instructor workflow:** access submission queue, open submitted work, view rubric, score each criterion, provide feedback, request corrections, approve/reject and track review history.

Use the existing rubric fields. Respect existing grading logic unless changes are explicitly documented. Prevent unauthorized access to other learners' assignments.

**Important business rule:** do not automatically complete a required lesson while its mandatory assignment is pending review.

Before implementing certification transitions, document the exact policy:

```text
QUIZ PASSED?
ASSIGNMENT REQUIRED?
ASSIGNMENT SUBMITTED?
ASSIGNMENT APPROVED?
ALL CONDITIONS SATISFIED?
```

Get approval for any policy change that alters current certification requirements.

## 15. REAL LEARNING CONTENT

Preserve the current twelve lessons. Do not discard the existing curriculum.

Lesson content includes operator mandate, data ownership, ethical obligations, data quality, Kobo, MEAL, PAYG, security and other existing course subjects.

Read the real database content and map all learning objectives. Display `academy_lessons.content_body`. Display complete educational content, including existing long-form explanations and self-evaluation.

Fix current missing media. For each lesson identify expected image and source interface; capture or recreate an accurate training representation.

Never display real customer data. Use fictional or anonymized records. Do not fabricate a screenshot and claim it represents a verified production feature. Prefer authentic screenshots from a controlled demo environment. If an interface does not exist, use a clearly labeled pedagogical mockup.

Store media in an appropriate asset system. Add alternative text, captions, responsive images, image optimization, source metadata and version information. Avoid empty placeholders.

## 16. LEARNING MOTION DESIGN

Animations must be elegant and educationally meaningful.

Possible effects:

- Smooth lesson transitions
- Animated progress indicators
- Chapter completion states
- Quiz result feedback
- Interactive diagrams
- Animated process flows
- 3D explanatory demonstrations
- Achievement transitions
- Guided attention
- Loading skeletons

Avoid constant movement, excessive parallax, flashing effects, slow animations and unnecessary 3D backgrounds.

Investigate Motion for React or existing animation utilities. Before adding dependencies, inspect the existing UI motion skill:

`.claude/skills/ui-motion/SKILL.md`

Reuse compatible local conventions. Respect `prefers-reduced-motion`. All educational activities must remain accessible without animation.

## 17. INSTRUCTOR AND ADMIN EXPERIENCE

Redesign `/admin/partners/training`.

The existing table is insufficient for professional training management. Create an instructor-oriented workspace.

**Candidate overview:** registered candidates, active learners, completed lessons, quiz performance, pending assignments, training completion eligibility.

**Candidate detail:** learning timeline, lesson states, quiz attempts, assignment history, rubric results, instructor feedback and last meaningful activity.

**Review workflow:** submissions awaiting review, grading interface, feedback, review status and audit history.

**Admin alerts:** new candidate, assignment requiring review, learner meeting completion criteria, assessment requiring intervention.

Analytics must come from real database records. Do not fabricate training activity or display percentages based on missing progress records without clearly indicating the absence of data. Administrative exceptions must be justified and logged.

## 18. AUTOMATED TRAINING COMPLETION

Implement a reliable progression from training to practical evaluation. The transition must respect the approved assessment policy.

When all requirements are satisfied:

1. Verify learner identity.
2. Verify operator dossier.
3. Verify all required lessons.
4. Verify assessments.
5. Verify required assignment reviews.
6. Check eligibility.
7. Persist completion atomically.
8. Update the authorized dossier status.
9. Record the transition.
10. Queue an admin notification.
11. Refresh learner dashboard.

Use existing certification services where appropriate. Ensure notification failures do not undo a valid completion or generate duplicate status transitions.

The practical evaluation must remain separate from online training. **Completing lessons must not automatically grant final operator certification.**

## 19. ACCESS CONTROL AND SECURITY

Respect existing Supabase authentication. Review:

- Operator candidate access
- Super admin supervision
- Suspended accounts
- Revoked accounts
- Cooperative members
- Existing organizations
- Academy table privileges
- RLS policies
- Service-role usage

A super admin viewing a course must not appear as a candidate unless that administrator has a legitimate operator dossier and uses the learner workflow.

Prevent unauthorized access. Ensure learner data is isolated correctly. Review rate limiting. A training room may contain many learners sharing a public IP address. Design fair account-level rate controls without removing abuse protection.

Avoid making ordinary candidates dependent on membership in a cooperative.

## 20. ACCESSIBILITY AND AFRICAN MOBILE CONTEXT

Design for real usage in Togo:

- Android Chrome
- Mobile data
- Variable latency
- Limited bandwidth
- Small screens
- Touch interaction
- Learners with limited digital experience
- Shared classroom networks

Target **WCAG 2.2 AA** where applicable.

Provide keyboard navigation, proper labels, screen-reader compatibility, visible focus indicators, accessible errors, readable typography, adequate contrast, reduced-motion support and non-3D alternatives.

A learner must not need a powerful GPU to complete mandatory training. **3D is an enhancement, not a prerequisite.**

Research offline-friendly learning methods, but do not promise offline completion without a tested synchronization mechanism.

## 21. PERFORMANCE

Establish performance budgets before implementing 3D experiences. Evaluate:

- Initial JavaScript payload
- LCP
- INP
- CLS
- 3D loading times
- FPS during simulations
- GPU memory
- Asset download size
- Battery usage

Use lazy loading. Render 3D only when needed. Do not load Three.js and Rapier on the initial dashboard unless strictly justified.

Use static content or lightweight diagrams where 3D does not improve learning.

Test desktop Chrome, mobile Chromium emulation and real Android when available. Do not claim actual Motorola performance without testing a physical Motorola device.

## 22. QUALITY ASSURANCE

Build automated tests around the real educational workflow. Minimum scenarios:

1. Candidate accesses authorized training.
2. Lesson opens and records `in_progress`.
3. Page refresh preserves the state.
4. Quiz rejects invalid submissions.
5. Correct server-side grading.
6. Failed quiz does not complete a lesson.
7. Passed quiz updates eligible progress.
8. Required assignments block completion until required review succeeds.
9. Instructor can review an assignment.
10. Unauthorized user cannot review it.
11. All requirements trigger correct training completion transition.
12. Admin receives appropriate signal.
13. Certification is not granted prematurely.
14. Suspended operator access is denied.
15. Super admin browsing does not create artificial learner activity.
16. Existing cooperative Academy workflows continue functioning.
17. Existing authentication works.
18. Responsive UI works on mobile.
19. Reduced-motion mode works.
20. WebGL fallback works.
21. No GPU memory growth after repeated simulation mounting and unmounting.
22. No duplicate completion records.
23. Parallel submissions do not corrupt state.
24. Retry after network failure is safe.

Use unit tests, integration tests and Playwright E2E tests as appropriate. Report actual pass/fail results.

## 23. IMPLEMENTATION STRATEGY

Use small, independently testable milestones.

### J0 — Baseline

Read the audit. Inspect `main`. Verify the code. Document the current state.

### J1 — Critical functional repair

Progress persistence, server-side completion rules, correct status transitions, admin notification mechanism, security hardening.

### J2 — Assessment engine

Quiz improvements, attempts, scoring, explanations, practical assignments, instructor review.

### J3 — Premium UI/UX

Course dashboard, course player, learning navigation, progress timeline, mobile experience and motion design.

### J4 — Educational content

Full lesson content, authentic screenshots, interactive diagrams, learning objectives and case studies.

### J5 — Interactive 3D Lab

Start with one meaningful 3D simulation: **digital farmer registration** or **digital membership card verification**. Measure educational value, technical stability and mobile performance.

### J6 — Admin learning management

Instructor review interface, candidate progress analytics, training completion alerts and feedback workflow.

### J7 — Validation

Unit tests, integration tests, browser tests, security tests, mobile tests and accessibility tests.

### J8 — Release preparation

Documentation, user acceptance checklist, production migration plan, rollback plan, monitoring and release notes.

## 24. DELIVERY RULES

Work in the existing repository. Do not overwrite unrelated changes. Create an isolated feature branch and small, reviewable commits.

Preserve current production data. Do not execute destructive operations on the production database. Use local or staging environments for migrations and functional tests. Do not write test records to production.

Do not silently change curriculum or certification requirements. Do not add paid dependencies without approval. **Do not deploy automatically or merge into `main` without approval.**

Present evidence after each milestone:

```text
FILES CHANGED
BUGS FIXED
FEATURES ADDED
DATABASE CHANGES
TESTS RUN
TEST RESULTS
PERFORMANCE MEASUREMENTS
KNOWN LIMITATIONS
REMAINING WORK
```

## 25. EXPECTED RESULT

AgriAcademy must become a serious, beautiful and reliable educational platform — not merely a collection of PDF-like lessons.

**Learner experience:** structured learning journey, clear objectives, high-quality explanations, interactive demonstrations, practical exercises, professional assessments, immediate and useful feedback, persistent progress and transparent certification requirements.

**Instructor experience:** reliable learner monitoring, practical assignment correction, meaningful learning analytics, clear completion signals and secure administration.

Combine:

**WORLDQUANT-INSPIRED EDUCATIONAL RIGOR**  
**+ PREMIUM MODERN UI/UX**  
**+ REACT THREE FIBER SIMULATIONS**  
**+ REAL-WORLD AGRICULTURAL TRAINING**  
**+ SECURE LEARNING MANAGEMENT**

**BEGIN WITH J0.** Then implement J1 and validate it before proceeding to visual enhancements. Provide a proposed visual architecture and screen specifications for J3 before coding that redesign.

The first 3D simulation is a pilot, not authorization to rebuild the entire interface in WebGL.

Do not stop at producing a plan. Implement the approved milestones, run their tests and provide evidence.

**FINAL PRINCIPLE:**

```text
LEARNING QUALITY FIRST.
FUNCTIONAL CORRECTNESS FIRST.
IMMERSIVE DESIGN WITH PURPOSE.
NO DECORATIVE COMPLEXITY.
NO FALSE PROGRESS.
NO FAKE CERTIFICATION.
```
