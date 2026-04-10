const express = require("express");
const bcrypt = require("bcryptjs");
const {
  collection,
  doc,
  getDoc,
  query,
  where,
  limit,
  getDocs,
  orderBy,
  setDoc,
  serverTimestamp,
} = require("firebase/firestore");
const { db } = require("../config/firebase");
const { createAccessToken, isAdminUser, requireAdmin, requireAuth } = require("../middleware/auth");

const router = express.Router();
const usersCollection = collection(db, "users");

function sanitizeUser(user) {
  return {
    id: user.id,
    nama: user.nama || null,
    email: user.email || null,
    role: user.role || "user",
    createdAt: user.createdAt || null,
  };
}

function buildAuthResponse(user) {
  const sanitizedUser = sanitizeUser(user);

  return {
    user: sanitizedUser,
    token: createAccessToken(sanitizedUser),
  };
}

router.post("/register", async (req, res) => {
  try {
    const { nama, email, password } = req.body;

    if (!nama || !email || !password) {
      return res.status(400).json({
        message: "nama, email, and password are required.",
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        message: "Password must be at least 6 characters.",
      });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const existingUserSnapshot = await getDocs(
      query(usersCollection, where("email", "==", normalizedEmail), limit(1))
    );

    if (!existingUserSnapshot.empty) {
      return res.status(409).json({
        message: "Email is already registered.",
      });
    }

    const userRef = doc(usersCollection);
    const role = isAdminUser({ email: normalizedEmail }) ? "admin" : "user";
    const userData = {
      id: userRef.id,
      nama: nama.trim(),
      email: normalizedEmail,
      role,
      passwordHash: await bcrypt.hash(password, 10),
      createdAt: serverTimestamp(),
    };

    await setDoc(userRef, userData);

    return res.status(201).json({
      message: "Register successful.",
      data: {
        ...buildAuthResponse(userData),
      },
    });
  } catch (error) {
    return res.status(500).json({
      message: "Failed to register user.",
      error: error.message,
    });
  }
});

router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        message: "email and password are required.",
      });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const userSnapshot = await getDocs(
      query(usersCollection, where("email", "==", normalizedEmail), limit(1))
    );

    if (userSnapshot.empty) {
      return res.status(401).json({
        message: "Invalid email or password.",
      });
    }

    const user = userSnapshot.docs[0].data();
    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);

    if (!isPasswordValid) {
      return res.status(401).json({
        message: "Invalid email or password.",
      });
    }

    const role = user.role || (isAdminUser({ email: user.email }) ? "admin" : "user");

    return res.status(200).json({
      message: "Login successful.",
      data: {
        ...buildAuthResponse({ ...user, role }),
      },
    });
  } catch (error) {
    return res.status(500).json({
      message: "Failed to login.",
      error: error.message,
    });
  }
});

router.get("/admin/users", requireAuth, requireAdmin, async (req, res) => {
  try {
    const userSnapshot = await getDocs(query(usersCollection, orderBy("createdAt", "desc")));
    const users = userSnapshot.docs.map((snapshot) => sanitizeUser(snapshot.data()));

    return res.status(200).json({
      message: "User data fetched successfully.",
      data: users,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Failed to fetch user data.",
      error: error.message,
    });
  }
});

router.get("/admin/users/:userId", requireAuth, requireAdmin, async (req, res) => {
  try {
    const userRef = doc(usersCollection, req.params.userId);
    const userSnapshot = await getDoc(userRef);

    if (!userSnapshot.exists()) {
      return res.status(404).json({
        message: "User not found.",
      });
    }

    return res.status(200).json({
      message: "User detail fetched successfully.",
      data: sanitizeUser(userSnapshot.data()),
    });
  } catch (error) {
    return res.status(500).json({
      message: "Failed to fetch user detail.",
      error: error.message,
    });
  }
});

module.exports = router;
