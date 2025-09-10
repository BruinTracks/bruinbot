# BruinTracks (Formerly BruinBot) - AI-Powered Course Scheduling Platform

A comprehensive course scheduling and academic planning application for UCLA students, featuring AI-powered course recommendations, intelligent schedule optimization, and seamless Google Calendar integration.

[![Image Alt Text](thumbnail_url)](https://youtu.be/ay24xvRFV3Q)
## 🎯 Overview

BruinTracks helps UCLA students create optimal course schedules by analyzing prerequisites, course availability, and personal preferences. The platform uses advanced algorithms and AI to generate personalized academic plans while considering graduation timelines and course conflicts.

## ✨ Key Features

### AI-Powered Features

- **Conversational Schedule Editor**: Natural language commands like "move CS 31 to next quarter" or "swap these courses"
- **AI Academic Assistant**: GPT-4 powered chat interface for course recommendations and academic guidance
- **Intelligent Course Optimization**: Advanced algorithms for optimal course sequencing

### Smart Scheduling

- **Prerequisite Resolution**: Automatic handling of course dependencies and requirements
- **Conflict Detection**: Real-time identification of time conflicts and scheduling issues
- **Preference Optimization**: Customizable preferences for time slots, buildings, and instructors
- **Multi-Major Support**: Support for single and double major scenarios

### Integrations

- **Google OAuth**: Secure authentication with Google accounts
- **Google Calendar Export**: One-click export of optimized schedules with recurring events
- **Supabase Database**: Real-time course data and user management

### User Experience

- **Interactive UI**: Modern React interface with smooth animations
- **Multi-Step Onboarding**: Guided setup process for new users
- **Saved Schedules**: Store and compare multiple academic plans
- **Real-Time Updates**: Instant feedback on schedule changes

## Tech Stack

### Frontend

- **React 19** - Modern UI framework with hooks
- **Vite** - Fast build tool and development server
- **Tailwind CSS** - Utility-first CSS framework
- **Framer Motion** - Smooth animations and transitions
- **React Router** - Client-side routing

### Backend

- **Node.js** - JavaScript runtime
- **Express.js** - Web application framework
- **Python** - Scheduling algorithms and data processing
- **Supabase** - PostgreSQL database with real-time features

### AI & APIs

- **OpenAI GPT-4** - Natural language processing and function calling
- **Google OAuth 2.0** - Authentication
- **Google Calendar API** - Schedule export functionality

### Database

- **PostgreSQL** - Primary database
- **Custom RPC Functions** - Optimized queries for course data
- **Real-time subscriptions** - Live data updates

## Getting Started

### Prerequisites

- Node.js (v18 or higher)
- Python (v3.8 or higher)
- Supabase account
- OpenAI API key
- Google Cloud Platform account

### Installation

1. **Clone the repository**

   ```bash
   git clone https://github.com/yourusername/bruintracks.git
   cd bruintracks
   ```

2. **Install dependencies**

   ```bash
   # Install frontend dependencies
   cd bruintracks_client
   npm install

   # Install backend dependencies
   cd ../bruintracks_server
   npm install
   ```

3. **Set up environment variables**

   Create `.env` files in both `bruintracks_client` and `bruintracks_server` directories:

   **bruintracks_client/.env:**

   ```env
   VITE_SUPABASE_URL=your_supabase_url
   VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
   ```

   **bruintracks_server/.env:**

   ```env
   SUPABASE_URL=your_supabase_url
   SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_key
   OPENAI_API_KEY=your_openai_api_key
   GOOGLE_CLIENT_ID=your_google_client_id
   GOOGLE_CLIENT_SECRET=your_google_client_secret
   ```

4. **Set up the database**

   Run the SQL scripts in `bruintracks_server/tools/rpc_functions/` to create the necessary database functions:

   ```sql
   -- Run each .sql file in the rpc_functions directory
   ```

5. **Start the development servers**

   ```bash
   # Start backend server
   cd bruintracks_server
   npm run dev

   # Start frontend server (in a new terminal)
   cd bruintracks_client
   npm run dev
   ```

6. **Open the application**

   Navigate to `http://localhost:5173` in your browser.

## 📖 Usage

### First Time Setup

1. **Sign in** with your Google account
2. **Select your major(s)** - Support for single and double majors
3. **Input your transcript** - Add completed courses with grades
4. **Set preferences** - Choose preferred time slots, buildings, and instructors
5. **Generate schedule** - Let AI create your optimal course plan

### Using the AI Assistant

- **Ask questions** about courses, prerequisites, or academic requirements
- **Modify schedules** using natural language commands
- **Get recommendations** for course selections and timing

### Schedule Management

- **View detailed schedules** with course times, locations, and instructors
- **Edit schedules** through the interactive interface or AI commands
- **Export to Google Calendar** with one-click integration
- **Save multiple plans** for comparison and backup

## Architecture

### Frontend Architecture

```
bruintracks_client/
├── src/
│   ├── components/          # React components
│   ├── hooks/              # Custom React hooks
│   ├── contexts/           # React contexts (Auth)
│   └── assets/             # Static assets
```

### Backend Architecture

```
bruintracks_server/
├── controllers/            # Request handlers
├── routes/                # API route definitions
├── middleware/            # Authentication and validation
├── services/              # Business logic
├── tools/                 # Utilities and scripts
└── scheduler.py           # Core scheduling algorithm
```

### Database Schema

- **Users**: Authentication and profile data
- **Courses**: Course information and prerequisites
- **Sections**: Course sections with times and instructors
- **Schedules**: User-generated course schedules
- **Terms**: Academic terms and quarters

## Customization

### Adding New Majors

1. Add major requirements to the database
2. Update the frontend major selection options
3. Test with sample transcripts

### Modifying Scheduling Logic

1. Edit `scheduler.py` for algorithm changes
2. Update preference weights and constraints
3. Test with various course combinations

### Extending AI Capabilities

1. Add new RPC functions for database queries
2. Update GPT function calling definitions
3. Enhance natural language processing

## Acknowledgments

- UCLA Registrar's Office for course data
- UCLA DGT and OpenAI for GPT-4 API access

---

**Built with ❤️ for UCLA students**
