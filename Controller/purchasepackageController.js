import PackagePurchaseModel from "../models/PackagePurchaseModel.js";
import PackagesModel from "../models/PackagesModel.js";
import UserModel from "../models/UserModel.js"; // Assuming UserModel is your user model

// Package Purchase Controller

// Package Purchase Controller

export const packagePurchaseController = async (req, res) => {
  try {
    const { slug, transactionId, sendernumber } = req.body;
    const userId = req.user._id; // Assuming user authentication middleware provides `req.user`

    // Validate input
    if (!slug || !transactionId || !sendernumber) {
      return res.status(400).json({ message: "All fields are required" });
    }
    const existingTransaction = await PackagePurchaseModel.findOne({
      transactionId,
    });
    if (existingTransaction) {
      console.log("Transaction ID already exists");
      return res.status(400).json({ message: "Transaction ID already exists" });
    }
    // Find the package by slug
    const pkg = await PackagesModel.findOne({ slug });
    if (!pkg || !pkg.isActive) {
      console.log("Package not available or inactive");
      return res
        .status(400)
        .json({ message: "Package not available or inactive" });
    }
    const currentDate = new Date();
    const expiryDate = new Date(currentDate);
    expiryDate.setDate(expiryDate.getDate() + pkg.duration);
    console.log("Expiry date calculated:", expiryDate);
    // Update all previous records for the user to "Expired"
    await PackagePurchaseModel.updateMany(
      { userId },
      { $set: { packageStatus: "Expired" } }
    );

    // Create a new record
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

    // Save the new record
    await purchase.save();

    res
      .status(200)
      .json({ message: "Package purchased successfully", purchase });
  } catch (error) {
    console.error("Error occurred:", error);
    res.status(500).json({ message: "Something went wrong" });
  }
};

const USD_TO_PKR_RATE = 280;

// Function to handle commission distribution
const distributeCommission = async (userId, commissionToAdd, level = 1) => {
  let currentUserId = userId;
  let commissionAmount = commissionToAdd;

  // Loop to distribute commission down the referral chain
  while (currentUserId && commissionAmount > 0) {
    const user = await UserModel.findById(currentUserId);

    if (user && user.referredBy) {
      const referrer = await UserModel.findOne({
        referralCode: user.referredBy,
      });

      if (referrer) {
        // Halve commission for each subsequent level (50% commission for the next level)
        let commissionForReferrer = commissionAmount / 2; // 50% of the commission

        // Add commission to the referrer's earnings
        referrer.CommissionAmount =
          (referrer.CommissionAmount || 0) + commissionForReferrer;
        referrer.earnings = (referrer.earnings || 0) + commissionForReferrer;
        referrer.TotalEarnings =
          (referrer.TotalEarnings || 0) + commissionForReferrer;

        // Save referrer's updated information
        await referrer.save();

        // Move up the referral chain and distribute commission
        currentUserId = referrer._id;
        level++;
        commissionAmount = commissionForReferrer; // Set the new commission for the next level
      } else {
        break; // If no referrer found, stop the commission distribution
      }
    } else {
      break; // If no referredBy field, stop the commission distribution
    }
  }
};

// Update package status and finalize commission on activation
export const updateStatusController = async (req, res) => {
  try {
    const { packageId } = req.params;
    const { packageStatus } = req.body;

    const purchase = await PackagePurchaseModel.findById(packageId);
    if (!purchase) {
      return res.status(404).json({ message: "Package purchase not found" });
    }

    const currentDate = new Date();

    // Expiry logic: if the package expired
    if (
      purchase.expiryDate <= currentDate &&
      purchase.packageStatus !== "Expired"
    ) {
      purchase.packageStatus = "Expired";
    } else {
      // Check if the status is valid
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
    }

    // Finalize commission when package becomes active
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

            // Handle Currency Conversion
            let commissionToAdd;

            if (user.currency === referrer.currency) {
              commissionToAdd = commissionRate;
            } else {
              commissionToAdd =
                user.currency === "USD" && referrer.currency === "PKR"
                  ? commissionRate * USD_TO_PKR_RATE
                  : commissionRate / USD_TO_PKR_RATE;
            }

            // Add commission to the referrer's earnings
            referrer.CommissionAmount =
              (referrer.CommissionAmount || 0) + commissionToAdd;
            referrer.earnings = (referrer.earnings || 0) + commissionToAdd;
            referrer.TotalEarnings =
              (referrer.TotalEarnings || 0) + commissionToAdd;

            // Distribute commission up the referral chain
            await distributeCommission(referrer._id, commissionToAdd);

            await referrer.save();
          }
        }
      }
    }

    // Save updated purchase
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
// Get user membership details
export const getUserMembershipController = async (req, res) => {
  try {
    const userId = req.user._id;

    // Find the most recent membership purchase (most recent by purchase date)
    const membership = await PackagePurchaseModel.findOne({ userId })
      .sort({ purchaseDate: -1 }) // Sort by purchaseDate in descending order
      .populate({
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

// Get latest user membership details
// Get all user membership details (all records)
export const getUserAllMembershipController = async (req, res) => {
  try {
    const userId = req.user._id;

    // Find all membership purchases for the logged-in user
    const memberships = await PackagePurchaseModel.find({ userId }).populate({
      path: "packagesId",
      select: "name duration earningRate", // Retrieve the relevant package details
      model: PackagesModel,
    });

    if (!memberships || memberships.length === 0) {
      return res.status(404).json({ message: "No membership records found" });
    }

    // Respond with all membership records
    const membershipDetails = memberships.map((membership) => ({
      packageName: membership.packagesId.name,
      packageStatus: membership.packageStatus,
      purchaseDate: membership.purchaseDate,
      expiryDate: membership.expiryDate,
      earningRate: membership.packagesId.earningRate,
    }));

    res.status(200).json({
      message: "All membership records fetched successfully",
      memberships: membershipDetails,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Something went wrong" });
  }
};
