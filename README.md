# Smart Queue System

A clean, minimalistic, and responsive smart queue web application. This project features a beautiful frontend built with vanilla HTML/CSS/JS and a scalable backend powered by Node.js, Express, and PostgreSQL.

## 🚀 Installation & Setup

### Prerequisites
- [Node.js](https://nodejs.org/) installed
- [PostgreSQL](https://www.postgresql.org/) database running

### 1. Database Setup
1. Create a PostgreSQL database (e.g., `queue_db`).
2. Make sure you have your database credentials handy (username, password, etc.).

### 2. Backend Setup
The backend serves the API on port `5000` and manages the database.

1. Navigate to the `backend` directory:
   ```bash
   cd backend
   ```
2. Install the necessary dependencies:
   ```bash
   npm install
   ```
3. Set up your environment variables by copying the example file:
   ```bash
   cp .env.example .env
   ```
4. Open your new `.env` file and update the variables to match your local PostgreSQL configuration:
   ```env
   PORT=5000
   DB_HOST=localhost
   DB_USER=your_postgres_user
   DB_PASSWORD=your_postgres_password
   DB_NAME=queue_db
   DB_PORT=5432
   DATABASE_URL=postgres://your_postgres_user:your_postgres_password@localhost:5432/queue_db
   ```
5. Run the database migrations to create the required tables:
   ```bash
   npm run migrate up
   ```
6. Start the backend server:
   ```bash
   npm start
   ```
   *The server should now be running on `http://localhost:5000`.*

### 3. Frontend Setup
The frontend is built with vanilla web technologies, so no complex JS build steps are required.

1. Ensure the Node.js backend is actively running.
2. Navigate to the `frontend` folder and open the `index.html` file in any modern web browser.
   - Alternatively, you can easily serve it using an extension like VS Code's **Live Server** or via a simple Python HTTP server: `python -m http.server 8000`.
3. The UI will automatically connect to your local backend API!

## Features included
- **Add Customers**: Quickly add a customer with their desired service request.
- **Queue Management**: Instantly serve the next customer in line.
- **Past Customers Board**: Keep track of the history of served customers.
- **Database Reset**: Easily wipe and restart the queue for a new day.
- **Modern UI**: Polished, card-based interface with responsive layouts, visual hierarchy, and smooth CSS micro-animations.
