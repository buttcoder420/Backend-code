import slugify from "slugify";
import PackagesModel from "../models/PackagesModel.js";
import UserModel from "../models/UserModel.js";

// Utility function to calculate remaining price after discount
const calculateRemainingPrice = (price, discount = 0) => {
  const remainingPrice = price - discount;
  if (remainingPrice <= 0) {
    throw new Error("Price after discount must be greater than 0");
  }
  return remainingPrice;
};

// Create Package Controller
export const createPackageController = async (req, res) => {
  try {
    const {
      name,
      description,
      price,
      duration,
      earningRate,
      numOfAds,
      commissionRate,
      discount,
      Packagecurrency,
    } = req.body;

    // Validation
    if (
      !name ||
      !description ||
      !price ||
      !duration ||
      !earningRate ||
      !commissionRate ||
      !Packagecurrency
    ) {
      return res.status(400).send({ error: "All fields are required" });
    }

    if (!["USD", "PKR"].includes(Packagecurrency)) {
      return res
        .status(400)
        .send({ error: "Invalid currency, must be USD or PKR" });
    }

    // Calculate remaining price after discount
    const remainingPrice = calculateRemainingPrice(price, discount);

    // Create new package
    const slug = slugify(name, { lower: true, strict: true });
    const existingSlug = await PackagesModel.findOne({ slug });
    if (existingSlug) {
      return res
        .status(400)
        .send({ error: "Package with this name already exists" });
    }

    const newPackage = new PackagesModel({
      ...req.body,
      slug,
      price: remainingPrice,
    });

    await newPackage.save();

    res.status(201).send({
      success: true,
      message: "Package created successfully",
      package: newPackage,
    });
  } catch (error) {
    console.error(error);
    res.status(400).send({
      success: false,
      message: "Error in creating package",
      error: error.message,
    });
  }
};

// Get All Packages Controller
export const getAllPackageController = async (req, res) => {
  try {
    const usdPackages = await PackagesModel.find({ Packagecurrency: "USD" });
    const pkrPackages = await PackagesModel.find({ Packagecurrency: "PKR" });

    res.status(200).send({
      success: true,
      totalUsdPackages: usdPackages.length,
      totalPkrPackages: pkrPackages.length,
      message: "Packages filtered by currency",
      usdPackages,
      pkrPackages,
    });
  } catch (error) {
    console.error(error);
    res.status(500).send({
      success: false,
      message: "Error in getting packages",
      error: error.message,
    });
  }
};

// Get Packages Filtered by User's Currency
export const getPackage = async (req, res) => {
  try {
    const userId = req.user._id;
    const user = await UserModel.findById(userId);
    const userCurrency = user.currency || "PKR";

    const filteredPackages = await PackagesModel.find({
      Packagecurrency: userCurrency,
    });

    res.status(200).send({
      success: true,
      totalPackages: filteredPackages.length,
      message: "Packages filtered by user's currency",
      packages: filteredPackages,
    });
  } catch (error) {
    console.error(error);
    res.status(500).send({
      success: false,
      message: "Error in getting packages",
      error: error.message,
    });
  }
};

// Get Single Package by Slug
export const singlePackageController = async (req, res) => {
  try {
    const { slug } = req.params;
    const getPackage = await PackagesModel.findOne({ slug });

    if (!getPackage) {
      return res.status(404).send({
        success: false,
        message: "Package not found",
      });
    }

    res.status(200).send({
      success: true,
      message: "Get single package",
      package: getPackage,
    });
  } catch (error) {
    console.error(error);
    res.status(500).send({
      success: false,
      message: "Error in getting single package",
      error: error.message,
    });
  }
};

// Delete Package Controller
export const deletePackageController = async (req, res) => {
  try {
    await PackagesModel.findByIdAndDelete(req.params.pid);

    res.status(200).send({
      success: true,
      message: "Package deleted successfully",
    });
  } catch (error) {
    console.error(error);
    res.status(500).send({
      success: false,
      message: "Error in deleting package",
      error: error.message,
    });
  }
};

// Update Package Controller
export const updatePackageController = async (req, res) => {
  try {
    const {
      name,
      description,
      price,
      duration,
      earningRate,
      isActive,
      discount,
      commissionRate,
      Packagecurrency,
    } = req.body;

    // Validation
    if (
      !name ||
      !description ||
      !price ||
      !duration ||
      !earningRate ||
      !commissionRate
    ) {
      return res.status(400).send({ error: "All fields are required" });
    }

    if (!["USD", "PKR"].includes(Packagecurrency)) {
      return res
        .status(400)
        .send({ error: "Invalid currency, must be USD or PKR" });
    }

    const remainingPrice = calculateRemainingPrice(price, discount);

    const updatedPackage = await PackagesModel.findByIdAndUpdate(
      req.params.pid,
      { ...req.body, slug: slugify(name), price: remainingPrice },
      { new: true, runValidators: true }
    );

    if (!updatedPackage) {
      return res.status(404).send({ error: "Package not found" });
    }

    res.status(200).send({
      success: true,
      message: "Package updated successfully",
      package: updatedPackage,
    });
  } catch (error) {
    console.error(error);
    res.status(500).send({
      success: false,
      message: "Error in updating package",
      error: error.message,
    });
  }
};
