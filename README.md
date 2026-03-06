# StudyFlow AI  
**AI-assisted semester planning for students dealing with fragmented course information**

## Overview
StudyFlow AI is a prototype that transforms messy course information into a clear, structured, and actionable semester plan.

Students often receive important information across multiple sources: course pages, PDFs, announcements, calendars, reading lists, and assignment descriptions. This creates unnecessary cognitive load and makes it difficult to build a clear overview of what needs to be done, when, and in what order.

StudyFlow AI addresses this problem by allowing the user to paste raw semester or course-plan text into the interface. The system then uses the OpenAI API to structure the information into a streamlined weekly study plan with readings, deadlines, tasks, and estimated workload.

---

## Problem
University learning platforms often contain all the necessary information, but not in a format that supports efficient planning and decision-making.

Typical issues include:

- course information is fragmented across multiple pages
- deadlines are separated from literature and teaching activities
- students must manually interpret and reorganize information
- important tasks compete equally for attention
- planning becomes mentally demanding rather than supportive

This creates friction in the student's workflow and contributes to information overload.

---

## Solution
StudyFlow AI restructures unorganized course information into a readable and usable study flow.

The user pastes course-related text such as:

- semester plans
- reading lists
- assignment descriptions
- weekly schedules
- deadline overviews

The system then generates:

- a structured weekly plan
- a clearer connection between dates, readings, and tasks
- prioritised next actions
- estimated workload per week
- a simplified overview that reduces decision fatigue

---

## Core Features

### 1. Paste and structure
The user pastes unformatted course information into a text field.

Example input:

```text
Course: Information Architecture
Week 3:
Reading: Chapter 4 + Article "Digital Overload"
Assignment: Reflection paper due March 14
Lecture: Tuesday 10:00-12:00
