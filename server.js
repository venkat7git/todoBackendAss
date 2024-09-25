// server.js
const express = require("express");
const bodyParser = require("body-parser");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const uuid = require("uuid");
const sqlite3 = require("sqlite3").verbose();
const cors = require("cors");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

app.use(cors());
app.use(bodyParser.json());

// Connect to SQLite3 Database
const db = new sqlite3.Database("./database.sqlite", (err) => {
  if (err) {
    console.error(err.message);
  }
  console.log("Connected to SQLite3 database.");
});

// Log requests
app.use((req, res, next) => {
  console.log(`Request Method: ${req.method}, Request URL: ${req.url}`);
  next();
});

app.use((req, res, next) => {
  console.log("Request Body:", req.body);
  console.log("Request Headers:", req.headers);
  next();
});

// server.js or a separate migration script
// const db = require("./database");

// Create Users table
const createUsersTable = `
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password TEXT NOT NULL
  );
`;

// Create Tasks table
const createTasksTable = `
  CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    status TEXT CHECK( status IN ('pending','in progress','done','completed') ) DEFAULT 'pending',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );
`;

// Execute the table creation queries
db.serialize(() => {
  db.run(createUsersTable, (err) => {
    if (err) {
      console.error("Error creating users table:", err.message);
    } else {
      console.log("Users table created or already exists.");
    }
  });

  db.run(createTasksTable, (err) => {
    if (err) {
      console.error("Error creating tasks table:", err.message);
    } else {
      console.log("Tasks table created or already exists.");
    }
  });
});

const createUser = async (name, email, password) => {
  try {
    // Check if email already exists
    db.get("SELECT * FROM users WHERE email = ?", [email], async (err, row) => {
      if (err) {
        console.error("Error querying user:", err.message);
        return;
      }

      if (row) {
        // If the user already exists
        console.error("Error: Email already exists");
        return;
      }

      // If the email does not exist, create the user
      const hashedPassword = await bcrypt.hash(password, 10);
      const id = uuid.v4();

      db.run(
        `INSERT INTO users (id, name, email, password) VALUES (?, ?, ?, ?)`,
        [id, "devi", "devi@1gmail.com", hashedPassword],
        (err) => {
          if (err) {
            console.error("Error inserting user:", err.message);
          } else {
            console.log("User inserted successfully");
          }
        }
      );
    });
  } catch (error) {
    console.error("Error creating user:", error.message);
  }
};

// JWT Middleware
const authenticateToken = (req, res, next) => {
  const token = req.headers["authorization"];
  if (!token) return res.status(401).send("Access Denied");
  jwt.verify(token, "secretkey", (err, decoded) => {
    if (err) return res.status(403).send("Invalid Token");
    req.user = decoded;
    next();
  });
};

// Signup Route
app.post("/signup", async (req, res) => {
  console.log("Signup route hit");
  const { name, email, password } = req.body;
  if (!name || !email || !password) {
    return res.status(400).send("Missing required fields");
  }
  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const id = uuid.v4();
    db.run(
      "INSERT INTO users (id, name, email, password) VALUES (?, ?, ?, ?)",
      [id, name, email, hashedPassword],
      (err) => {
        if (err) {
          console.error("Error inserting user:", err.message);
          return res.status(500).send(err.message);
        }
        res.status(201).send("User Registered");
      }
    );
  } catch (error) {
    console.error("Error during signup:", error.message);
    res.status(500).send("Server error");
  }
});

// Login Route
app.post("/login", (req, res) => {
  const { email, password } = req.body;
  db.get("SELECT * FROM users WHERE email = ?", [email], async (err, user) => {
    if (!user) return res.status(400).send("Email not found");
    if (await bcrypt.compare(password, user.password)) {
      const token = jwt.sign({ userId: user.id }, "secretkey", {
        expiresIn: "1h",
      });
      res.status(200).json({ token });
    } else {
      res.status(400).send("Invalid credentials");
    }
  });
});

// Task creation route
app.post("/tasks", authenticateToken, (req, res) => {
  const { title, description, status } = req.body;

  // Validate status
  const validStatuses = ["pending", "in progress", "done", "completed"];
  if (!validStatuses.includes(status)) {
    return res
      .status(400)
      .send(
        "Invalid status value. Allowed values are: 'pending', 'in progress', 'done', 'completed'."
      );
  }

  const taskId = uuid.v4();
  db.run(
    "INSERT INTO tasks (id, user_id, title, description, status) VALUES (?, ?, ?, ?, ?)",
    [taskId, req.user.userId, title, description, status],
    (err) => {
      if (err) return res.status(500).send(err.message);
      res.status(201).send("Task created");
    }
  );
});

// Other CRUD routes...

// Get all tasks for the logged-in user
app.get("/tasks", authenticateToken, (req, res) => {
  db.all(
    "SELECT * FROM tasks WHERE user_id = ?",
    [req.user.userId],
    (err, rows) => {
      if (err) return res.status(500).send(err.message);
      res.status(200).json(rows);
    }
  );
});

app.put("/tasks/:id", authenticateToken, (req, res) => {
  const taskId = req.params.id;
  const { title, description, status } = req.body;

  // Validate status
  const validStatuses = ["pending", "in progress", "done", "completed"];
  if (!validStatuses.includes(status)) {
    return res.status(400).send("Invalid status value");
  }

  console.log("Updating task with ID:", taskId);
  console.log("Requesting user ID:", req.user.userId);

  // Check if task exists and belongs to the user
  db.get(
    `SELECT * FROM tasks WHERE id = ? AND user_id = ?`,
    [taskId, req.user.userId],
    (err, row) => {
      if (err) {
        console.error("Error retrieving task:", err.message);
        return res.status(500).send("Error retrieving task");
      }
      if (!row) {
        return res
          .status(404)
          .send("Task not found or you don't have permission");
      }

      // Update task
      db.run(
        `UPDATE tasks SET title = ?, description = ?, status = ? WHERE id = ? AND user_id = ?`,
        [title, description, status, taskId, req.user.userId],
        function (err) {
          if (err) {
            console.error("Error updating task:", err.message);
            return res.status(500).send("Error updating task");
          }
          if (this.changes === 0) {
            return res
              .status(404)
              .send("Task not found or you don't have permission");
          }
          res.status(200).send("Task updated successfully");
        }
      );
    }
  );
});

// Delete a task by taskId
app.delete("/tasks/:taskId", authenticateToken, (req, res) => {
  const { taskId } = req.params;

  db.run(
    "DELETE FROM tasks WHERE id = ? AND user_id = ?",
    [taskId, req.user.userId],
    (err) => {
      if (err) return res.status(500).send(err.message);
      res.status(200).send("Task deleted successfully");
    }
  );
});

app.get("/", (req, res) => {
  res.send("Welcome to backend todo project!");
});

// Example API route
app.get("/api/tasks", (req, res) => {
  res.json({ tasks: [] });
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
