const crypto = require("crypto");
const express = require("express");
const {
  collection,
  query,
  orderBy,
  getDocs,
  doc,
  setDoc,
  serverTimestamp,
} = require("firebase/firestore");
const { db } = require("../config/firebase");

const router = express.Router();
const testimonialsCollection = collection(db, "testimonials");

router.get("/", async (_req, res) => {
  try {
    const snapshot = await getDocs(
      query(testimonialsCollection, orderBy("createdAt", "desc"))
    );

    const testimonials = snapshot.docs.map((item) => ({
      id: item.id,
      ...item.data(),
    }));

    return res.status(200).json({
      message: "Testimonials fetched successfully.",
      data: testimonials,
    });
  } catch (error) {
    console.log("ERROR CODE:", error.code);
    console.log("ERROR MESSAGE:", error.message);

    return res.status(500).json({
      message: "Failed to fetch testimonials.",
      error: error.message,
    });
  }
});

router.post("/", async (req, res) => {
  try {
    const { nama, peran, testimoni } = req.body;

    if (!nama) {
      return res.status(400).json({
        message: "nama is required.",
      });
    }

    if (!peran) {
      return res.status(400).json({
        message: "peran is required.",
      });
    }

    if (!testimoni) {
      return res.status(400).json({
        message: "testimoni is required.",
      });
    }

    const testimonialId = crypto.randomUUID();
    const testimonialRef = doc(testimonialsCollection, testimonialId);
    const testimonialData = {
      id: testimonialId,
      nama: nama.trim(),
      peran: peran.trim(),
      testimoni: testimoni.trim(),
      createdAt: serverTimestamp(),
    };

    await setDoc(testimonialRef, testimonialData);

    return res.status(201).json({
      message: "Testimonial created successfully.",
      data: {
        id: testimonialData.id,
        nama: testimonialData.nama,
        peran: testimonialData.peran,
        testimoni: testimonialData.testimoni,
      },
    });
  } catch (error) {
    console.log("ERROR CODE:", error.code);
    console.log("ERROR MESSAGE:", error.message);

    return res.status(500).json({
      message: "Failed to create testimonial.",
      error: error.message,
    });
  }
});

module.exports = router;
