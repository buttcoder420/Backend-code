import PackagePurchaseModel from "../models/PackagePurchaseModel.js";
import PackagesModel from "../models/PackagesModel.js";
import UserModel from "../models/UserModel.js"; // Assuming UserModel is your user model

// Package Purchase Controller

const USD_TO_PKR_RATE = 280;

// Package Purchase Controller
export const packagePurchaseController = async (req, res) => {
  try {
    const { slug, transactionId, sendernumber } = req.body;
    const userId = req.user._id;

    // Check for existing transaction ID
    const existingTransaction = await PackagePurchaseModel.findOne({
      transactionId,
    });
    if (existingTransaction) {
      return res.status(400).json({ message: "Transaction ID already exists" });
    }

    // Find the package
    const pkg = await PackagesModel.findOne({ slug });
    if (!pkg || !pkg.isActive) {
      return res
        .status(400)
        .json({ message: "Package not available or inactive" });
    }

    const currentDate = new Date();
    const expiryDate = new Date(currentDate);
    expiryDate.setDate(expiryDate.getDate() + pkg.duration); // Calculate expiry

    // Expire existing active package
    await PackagePurchaseModel.updateMany(
      { userId, packageStatus: { $in: ["Active", "pending"] } },
      { $set: { packageStatus: "Expired" } }
    );

    // Create a new package purchase record
    const purchase = new PackagePurchaseModel({
      userId,
      packagesId: pkg._id,
      purchaseDate: currentDate,
      expiryDate,
      transactionId,
      sendernumber,
      paymentStatus: "Completed",
      packageStatus: "pending",
    });

    await purchase.save();

    res
      .status(200)
      .json({ message: "Package purchased successfully", purchase });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Something went wrong" });
  }
};

// Multi-Level Commission Distribution
const distributeCommission = async (userId, amount, levels) => {
  let currentUserId = userId;
  let commissionPercentages = [40, 30, 20, 10, 5, 2.5, 1.25];

  for (let level = 0; level < levels && currentUserId; level++) {
    const user = await UserModel.findById(currentUserId);
    if (user && user.referredBy) {
      const referrer = await UserModel.findOne({
        referralCode: user.referredBy,
      });

      if (referrer) {
        const commission = (amount * commissionPercentages[level]) / 100;

        referrer.CommissionAmount =
          (referrer.CommissionAmount || 0) + commission;
        referrer.earnings = (referrer.earnings || 0) + commission;
        referrer.TotalEarnings = (referrer.TotalEarnings || 0) + commission;

        await referrer.save();
        currentUserId = referrer._id; // Move up the referral chain
      } else {
        break; // No further referrers
      }
    } else {
      break; // No referrer for this user
    }
  }
};

// Update Package Status and Handle Commission
export const updateStatusController = async (req, res) => {
  try {
    const { packageId } = req.params;
    const { packageStatus } = req.body;

    const purchase = await PackagePurchaseModel.findById(packageId);
    if (!purchase) {
      return res.status(404).json({ message: "Package purchase not found" });
    }

    const validStatusValues = [
      "pending",
      "processing",
      "Active",
      "cancel",
      "Expired",
      "Completed",
    ];

    if (!validStatusValues.includes(packageStatus)) {
      return res.status(400).json({ message: "Invalid package status" });
    }

    purchase.packageStatus = packageStatus;

    if (packageStatus === "Active") {
      const user = await UserModel.findById(purchase.userId);
      if (user && user.referredBy) {
        const referrer = await UserModel.findOne({
          referralCode: user.referredBy,
        });

        if (referrer) {
          const pkg = await PackagesModel.findById(purchase.packagesId);
          if (pkg) {
            const commissionRate = pkg.commissionRate || 0;

            const initialCommission = commissionRate;

            // Distribute multi-level commission
            await distributeCommission(user._id, initialCommission, 7);
          }
        }
      }
    }

    await purchase.save();

    res
      .status(200)
      .json({ message: "Package status updated successfully", purchase });
  } catch (error) {
    console.error("Error updating status:", error);
    res.status(500).json({ message: "Something went wrong" });
  }
};

// Get all transactions
export const getAllTransactionController = async (req, res) => {
  try {
    const transactions = await PackagePurchaseModel.find({})
      .populate({ path: "userId", select: "email", model: UserModel })
      .populate({
        path: "packagesId",
        select: "name price",
        model: PackagesModel,
      });

    res.status(200).send({
      success: true,
      totalTransaction: transactions.length,
      message: "All Transaction list",
      transactions,
    });
  } catch (error) {
    console.error(error);
    res.status(500).send({
      success: false,
      error: error.message,
      message: "Error in getting Transaction",
    });
  }
};

// Get user membership details
export const getUserMembershipController = async (req, res) => {
  try {
    const userId = req.user._id;

    const membership = await PackagePurchaseModel.findOne({ userId }).populate({
      path: "packagesId",
      select: "name duration earningRate",
      model: PackagesModel,
    });

    if (!membership) {
      return res.status(404).json({ message: "No membership found" });
    }

    res.status(200).json({
      packageName: membership.packagesId.name,
      packageStatus: membership.packageStatus,
      purchaseDate: membership.purchaseDate,
      expiryDate: membership.expiryDate,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Something went wrong" });
  }
};
