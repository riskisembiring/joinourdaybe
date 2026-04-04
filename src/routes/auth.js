const express = require("express");
const bcrypt = require("bcryptjs");
const {
  collection,
  query,
  where,
  limit,
  getDocs,
  doc,
  setDoc,
  serverTimestamp,
} = require("firebase/firestore");
const { db } = require("../config/firebase");

const router = express.Router();
const usersCollection = collection(db, "users");

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
    const userData = {
      id: userRef.id,
      nama: nama.trim(),
      email: normalizedEmail,
      passwordHash: await bcrypt.hash(password, 10),
      createdAt: serverTimestamp(),
    };

    await setDoc(userRef, userData);

    return res.status(201).json({
      message: "Register successful.",
      data: {
        user: {
          id: userData.id,
          nama: userData.nama,
          email: userData.email,
        },
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

    return res.status(200).json({
      message: "Login successful.",
      data: {
        user: {
          id: user.id,
          nama: user.nama,
          email: user.email,
        },
      },
    });
  } catch (error) {
    return res.status(500).json({
      message: "Failed to login.",
      error: error.message,
    });
  }
});

module.exports = router;
