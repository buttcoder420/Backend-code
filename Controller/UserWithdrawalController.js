import PackagePurchaseModel from "../models/PackagePurchaseModel.js";
import UserModel from "../models/UserModel.js";
import WithdrawalAccountModel from "../models/WithdrawalAccountModel.js";
import WithdrawalModel from "../models/WithdrawalModel.js";

// Create a new withdrawal request

// Create a new withdrawal request
export const createWithdrawalRequestController = async (req, res) => {
  try {
    const { amount, paymentMethod, accountNumber, accountName } = req.body;

    // Validation
    if (!amount) {
      return res.status(400).send({ error: "Amount is required" });
    }
    if (!paymentMethod) {
      return res.status(400).send({ error: "Payment Method is required" });
    }
    if (!accountNumber) {
      return res.status(400).send({ error: "Account Number is required" });
    }
    if (!accountName) {
      return res.status(400).send({ error: "Account Name is required" });
    }

    // Fetch user details
    const user = await UserModel.findById(req.user._id);

    // Check if user's earnings are sufficient
    if (amount > user.earnings) {
      return res.status(400).send({
        error: "Insufficient earnings",
        currentEarnings: user.earnings,
      });
    }
    // Check if amount meets the minimum withdrawal requirement
    const withdrawalAccount = await WithdrawalAccountModel.findById(
      paymentMethod
    );
    if (!withdrawalAccount) {
      return res.status(400).send({ error: "Invalid payment method" });
    }
    if (amount < withdrawalAccount.minAmount) {
      return res.status(400).send({
        error: `Minimum withdrawal amount is ${withdrawalAccount.minAmount}`,
      });
    }

    // Fetch the latest withdrawal for this user
    const latestWithdrawal = await WithdrawalModel.findOne({
      userId: req.user._id,
    }).sort({ createdAt: -1 });

    // Determine deduction percentage and remaining amount logic
    let deductionRate = 50; // Initial deduction rate
    let amountToStore = amount;
    let activeReferralExists = false;

    if (latestWithdrawal) {
      // Check for active referrals within the time frame
      const activeReferral = await PackagePurchaseModel.findOne({
        userId: {
          $in: await UserModel.find({ referredBy: user.referralCode }).distinct(
            "_id"
          ),
        },
        packageStatus: "Active",
        createdAt: { $gte: latestWithdrawal.createdAt },
      });

      if (activeReferral) {
        // Reset deduction if an active referral exists
        activeReferralExists = true;
        deductionRate = 0;
      } else {
        // Increment deduction percentage for each withdrawal without referral
        const lastDeduction = latestWithdrawal.deductionPercent || 50;
        deductionRate = Math.min(lastDeduction + 10, 100); // Increment by 10%, cap at 100%
      }
    }

    // Calculate stored amount after deductions
    if (!activeReferralExists) {
      amountToStore = amount * (1 - deductionRate / 100); // Apply deduction
      // Calculate stored amount after deductions

      // If deduction rate is 100%, only 10% of the amount will be processed
      if (deductionRate === 100) {
        amountToStore = amount * 0.1; // Apply 10% of the amount
      } else {
        amountToStore = amount * (1 - deductionRate / 100); // Apply regular deduction
      }
    }

    // Deduct amount from user's earnings
    user.earnings -= amount;
    const remainingAmount = user.earnings;
    await user.save();

    // Create a new withdrawal request
    const newWithdrawal = new WithdrawalModel({
      userId: req.user._id,
      amount: amountToStore, // Store the deducted amount
      paymentMethod,
      accountNumber,
      accountName,
      deductionPercent: deductionRate, // Store deduction percentage
      remainingAmount, // Store remaining amount after deduction
      status: "pending",
    });

    await newWithdrawal.save();

    res.status(201).send({
      success: true,
      message: "Withdrawal request created successfully",
      withdrawal: newWithdrawal,
      deductionRate,
      remainingAmount,
    });
  } catch (error) {
    console.log(error);
    res.status(500).send({
      success: false,
      message: "Error in creating withdrawal request",
      error: error.message,
    });
  }
};

// Get all withdrawals for a user
export const getUserWithdrawalsController = async (req, res) => {
  try {
    const withdrawals = await WithdrawalModel.find({})
      .populate("paymentMethod", "method")
      .populate("package", "name")
      .populate(
        "userId",
        "email earnings totalReferred packageActivationStatus Commission remainingAmount"
      );

    res.status(200).send({
      success: true,
      totalWithdrawals: withdrawals.length,
      withdrawals,
    });
  } catch (error) {
    console.log(error);
    res.status(500).send({
      success: false,
      message: "Error in fetching withdrawals",
      error: error.message,
    });
  }
};

// Get a single withdrawal by ID
// Get the most recent withdrawal for the logged-in user
export const getSingleWithdrawalController = async (req, res) => {
  try {
    const userId = req.user._id; // Extract the user ID from the authenticated user

    // Find the most recent withdrawal for the user
    const withdrawal = await WithdrawalModel.findOne({ userId })
      .sort({ createdAt: -1 }) // Sort by creation date in descending order
      .populate("paymentMethod", "method");

    if (!withdrawal) {
      return res.status(404).send({
        success: false,
        message: "No withdrawals found for this user",
      });
    }

    res.status(200).send({
      success: true,
      withdrawal,
    });
  } catch (error) {
    console.log(error);
    res.status(500).send({
      success: false,
      message: "Error in fetching withdrawal",
      error: error.message,
    });
  }
};

// Update withdrawal status
export const updateWithdrawalStatusController = async (req, res) => {
  try {
    const { withdrawalId } = req.params;
    const { status } = req.body;

    const withdrawal = await WithdrawalModel.findById(withdrawalId);

    if (!withdrawal) {
      return res.status(404).send({
        success: false,
        message: "Withdrawal not found",
      });
    }

    // Update the withdrawal status
    withdrawal.status = status;
    await withdrawal.save();

    // Check if the status is "rejected"
    if (status === "rejected") {
      // Find the user associated with this withdrawal
      const user = await UserModel.findById(withdrawal.userId);

      if (!user) {
        return res.status(404).send({
          success: false,
          message: "User not found",
        });
      }

      // Calculate 70% of the withdrawal amount
      const refundAmount = (withdrawal.amount * 70) / 100;

      // Increment the user's earnings
      user.earnings += refundAmount;
      await user.save();

      return res.status(200).send({
        success: true,
        message:
          "Withdrawal status updated to rejected, and 70% of the amount has been added back to user's earnings.",
        refundAmount,
        updatedEarnings: user.earnings,
        withdrawal,
      });
    }

    // Default response for other statuses
    res.status(200).send({
      success: true,
      message: "Withdrawal status updated successfully",
      withdrawal,
    });
  } catch (error) {
    console.log(error);
    res.status(500).send({
      success: false,
      message: "Error in updating withdrawal status",
      error: error.message,
    });
  }
};

// Delete a withdrawal
export const deleteWithdrawalController = async (req, res) => {
  try {
    const { id } = req.params;

    const withdrawal = await WithdrawalModel.findByIdAndDelete(id);

    if (!withdrawal) {
      return res.status(404).send({
        success: false,
        message: "Withdrawal not found",
      });
    }

    res.status(200).send({
      success: true,
      message: "Withdrawal deleted successfully",
    });
  } catch (error) {
    console.log(error);
    res.status(500).send({
      success: false,
      message: "Error in deleting withdrawal",
      error: error.message,
    });
  }
};

//get all withdrawal of single user
export const getUserWithdrawalsByUserIdController = async (req, res) => {
  try {
    const userId = req.user._id; // Assuming the user's ID is stored in req.user._id after authentication

    const withdrawals = await WithdrawalModel.find({ userId }).populate(
      "paymentMethod",
      "method"
    );

    if (!withdrawals || withdrawals.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No withdrawals found for this user",
      });
    }

    res.status(200).json({
      success: true,
      totalwithdrawal: withdrawals.length,
      withdrawals,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch withdrawals for user",
      error: error.message,
    });
  }
};

//get deduction
export const getLatestDeductionPercentController = async (req, res) => {
  try {
    const userId = req.user._id; // Logged-in user's ID

    // Find the latest withdrawal for the user
    const latestWithdrawal = await WithdrawalModel.findOne({ userId })
      .sort({ createdAt: -1 }) // Sort by creation date (most recent first)
      .select("deductionPercent"); // Only fetch the deductionPercent field

    if (!latestWithdrawal) {
      return res.status(200).send({
        success: true,
        message: "No withdrawals found for this user",
        deductionPercent: null,
      });
    }

    res.status(200).send({
      success: true,
      message: "Latest deduction percentage retrieved successfully",
      deductionPercent: latestWithdrawal.deductionPercent,
    });
  } catch (error) {
    console.error("Error fetching latest deduction percentage:", error);
    res.status(500).send({
      success: false,
      message: "Error fetching latest deduction percentage",
      error: error.message,
    });
  }
};

export const getTotalReferrals = async (req, res) => {
  try {
    // Get the user ID from the authenticated request
    const userId = req.user._id; // Assuming you store user ID in req.user from authentication middleware

    // Find the user based on user ID
    const user = await UserModel.findById(userId);

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Find all users who have registered with this user's referral code
    const referredUsers = await UserModel.find({
      referredBy: user.referralCode,
    });

    // Prepare an array to store referral details
    let referralDetails = [];

    // Loop through referred users to fetch their details
    for (const referredUser of referredUsers) {
      // Find package purchase details for each referred user
      const packagePurchase = await PackagePurchaseModel.findOne({
        userId: referredUser._id,
      }).populate("packagesId", "name packageStatus"); // Populate 'packagesId' with 'name' and 'packageStatus'

      // Add relevant details to referralDetails
      referralDetails.push({
        username: referredUser.username,
        email: referredUser.email,
        packageName: packagePurchase ? packagePurchase.packagesId.name : null,
        packageStatus: packagePurchase ? packagePurchase.packageStatus : null,
      });
    }

    // Get the total number of referrals
    const totalReferrals = referralDetails.length;

    res.status(200).json({ totalReferrals, referralDetails });
  } catch (error) {
    console.error("Error fetching total referrals:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

//active refffetal
// Get active referrals for the logged-in user
export const getActiveReferralsController = async (req, res) => {
  try {
    // Get the user ID from the authenticated request
    const userId = req.user._id;

    // Find the user based on user ID
    const user = await UserModel.findById(userId);

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Find all users who have registered with this user's referral code
    const referredUsers = await UserModel.find({
      referredBy: user.referralCode,
    });

    if (referredUsers.length === 0) {
      return res.status(200).json({ message: "No referrals found." });
    }

    // Prepare an array to store referral details
    let activeReferralDetails = [];

    // Loop through referred users to fetch their package purchase details and status
    for (const referredUser of referredUsers) {
      // Find package purchase details for each referred user
      const packagePurchase = await PackagePurchaseModel.findOne({
        userId: referredUser._id,
        packageStatus: "Active", // Check if the package status is active
      }).populate("packagesId", "name packageStatus"); // Populate 'packagesId' with 'name' and 'packageStatus'

      // If the referred user has an active package, add their details to activeReferralDetails
      if (packagePurchase) {
        activeReferralDetails.push({
          username: referredUser.username,
          email: referredUser.email,
          packageName: packagePurchase.packagesId.name,
          packageStatus: packagePurchase.packageStatus,
        });
      }
    }

    // Get the total number of active referrals
    const totalActiveReferrals = activeReferralDetails.length;

    res.status(200).json({
      Totalteam: totalActiveReferrals.length,
      totalActiveReferrals,
      activeReferralDetails,
    });
  } catch (error) {
    console.error("Error fetching active referrals:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};
