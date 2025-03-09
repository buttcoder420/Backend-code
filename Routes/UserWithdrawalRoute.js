import express from "express";
import { isAdmin, requireSignIn } from "../middleware/UserMiddleware.js";
import {
  createWithdrawalRequestController,
  deleteWithdrawalController,
  getActiveReferralsController,
  getLatestDeductionPercentController,
  getSingleWithdrawalController,
  getUserWithdrawalsByUserIdController,
  getUserWithdrawalsController,
  getWithdrawalAmountController,
  updateWithdrawalStatusController,
} from "../Controller/UserWithdrawalController.js";

const router = express.Router();

// Create a new withdrawal request
router.post(
  "/create-withdrawal",
  requireSignIn,
  createWithdrawalRequestController
);
router.get("/get-active-refferal", requireSignIn, getActiveReferralsController);

router.get("/get-deduct", requireSignIn, getLatestDeductionPercentController);

// Get all withdrawals for a user
router.get(
  "/get-user-withdrawals",
  requireSignIn,
  getUserWithdrawalsController
);

// Get a single withdrawal by ID
router.get(
  "/get-single-withdrawal",
  requireSignIn,
  getSingleWithdrawalController
);

//get all withdrawal of single user
router.get(
  "/get-all-single-withdrawal",
  requireSignIn,
  getUserWithdrawalsByUserIdController
);
// Update withdrawal status
router.put(
  "/update-withdrawal-status/:withdrawalId",
  requireSignIn,
  isAdmin,
  updateWithdrawalStatusController
);

router.get(
  "/get-deudction-amount/amount",
  requireSignIn,
  getWithdrawalAmountController
);

// Delete a withdrawal
router.delete(
  "/delete-withdrawal/:id",
  requireSignIn,
  isAdmin,
  deleteWithdrawalController
);

export default router;
