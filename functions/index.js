const functions = require("firebase-functions");
const admin = require("firebase-admin");

admin.initializeApp();

exports.processValidation =
functions
    .region("asia-southeast1")
    .firestore
    .document(
        "artifacts/{appId}/public/data/validations/{validationId}",
    )
    .onCreate(async (snap, context) => {
      const validation = snap.data();

      const appId = context.params.appId;

      const contributionId =
    validation.contributionId;

      const contributionType =
    validation.contributionType;

      const collectionName =
    contributionType === "text" ?
      "text_contributions" :
      "audio_contributions";

      const contributionRef =
    admin.firestore().doc(
        `artifacts/${appId}/public/data/${collectionName}/${contributionId}`,
    );

      const contributionSnap =
    await contributionRef.get();

      if (!contributionSnap.exists) return;

      const contribution =
    contributionSnap.data();

      //
      // 1. Recalculate all votes for this contribution
      //
      const validationsSnap =
  await admin.firestore()
      .collection(
          `artifacts/${appId}/public/data/validations`,
      )
      .where(
          "contributionId",
          "==",
          contributionId,
      )
      .get();

      const stats = {
        correct: 0,
        incorrect: 0,
        unsure: 0,
      };

      validationsSnap.forEach((doc) => {
        const vote = doc.data().vote;

        if (stats[vote] !== undefined) {
          stats[vote]++;
        }
      });

      //
      // 2. Calculate totals
      //
      const totalVotes =
  stats.correct +
  stats.incorrect +
  stats.unsure;

      const decisiveVotes =
  stats.correct +
  stats.incorrect;

      //
      // 3. Confidence score
      //
      const confidence =
  decisiveVotes > 0 ?
    stats.correct / decisiveVotes :
    0;

      //
      // 4. Determine label
      //
      let finalLabel = "pending";

      if (totalVotes >= 3) {
        if (confidence >= 0.7) {
          finalLabel = "correct";
        } else if (confidence <= 0.3) {
          finalLabel = "incorrect";
        } else {
          finalLabel = "uncertain";
        }
      }

      //
      // 5. Validation threshold
      //
      const validated =
  totalVotes >= 5;

      //
      // 6. Quality tier
      //
      let qualityTier = "bronze";

      if (
        totalVotes >= 3 &&
  confidence >= 0.70
      ) {
        qualityTier = "silver";
      }

      if (
        totalVotes >= 5 &&
  confidence >= 0.90
      ) {
        qualityTier = "gold";
      }

      if (
        totalVotes >= 10 &&
  confidence >= 0.98
      ) {
        qualityTier = "platinum";
      }

      //
      // 7. Gold eligibility
      //
      const isGold =
  validated &&
  confidence >= 0.90 &&
  finalLabel === "correct";

      //
      // 8. Update original contribution
      //
      await contributionRef.update({

        validationCount: totalVotes,

        validationStats: stats,

        confidenceScore: confidence,

        finalLabel,

        validated,

        qualityTier,

        isGold,

      });

      //
      // 9. Promote to Gold Dataset
      //
      if (isGold) {
        const goldRef =
    admin.firestore().doc(
        `artifacts/${appId}/public/data/gold_dataset/${contributionId}`,
    );

        await goldRef.set(
            {
              sourceContributionId:
        contributionId,

              contributionType,

              userId:
        contribution.userId,

              createdAt:
        contribution.createdAt,

              promotedAt:
        admin.firestore.FieldValue.serverTimestamp(),

              validated: true,

              isGold: true,

              promptEnglish:
        contribution.promptEnglish,

              translationBurushaski:
        contribution.translationBurushaski,

              dialect:
        contribution.dialect,

              storagePath:
        contribution.storagePath || null,

              benchmarkSource:
        contribution.benchmarkSource || null,

              benchmarkId:
        contribution.benchmarkId || null,

              validationCount:
        totalVotes,

              validationStats:
        stats,

              confidenceScore:
        confidence,

              finalLabel,

              qualityTier,
            },
            {merge: true},
        );
      }
    });
