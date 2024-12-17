# **Land Use and Land Cover (LULC) Classification Workflow**

## **Overview**  
This repository presents a comprehensive workflow for building **Land Use and Land Cover (LULC)** classification models using **geospatial data science techniques**. The workflow covers the entire process from data pre-processing to accuracy assessment within **Google Earth Engine**, aimed at achieving reliable and scalable classification results.

This project aims to address these challenges and improve the overall accuracy by providing clear strategies and methodologies.

---

## **Workflow Steps**

### 1. **Pre-processing**  
The first step involves preparing Landsat imagery by removing unwanted artifacts such as clouds and shadows, and scaling spectral bands to ensure uniformity across the dataset.

### 2. **Annual Mosaics**  
To handle large-scale study areas effectively, multiple satellite scenes from the same year are combined into annual mosaics. This ensures comprehensive coverage and reduces the impact of missing data.

### 3. **Feature Space**  
To enhance spectral separability between classes, new variables are derived, such as **GCVI** (Green Chlorophyll Vegetation Index), **MNDWI** (Modified Normalized Difference Water Index), and **PRI** (Photochemical Reflectance Index). These features are processed using grouped reducers like **median**, **standard deviation**, **minimum**, and **maximum**, which help capture more meaningful patterns in the data.

### 4. **Exploratory Data Analysis (EDA)**  
In this stage, the distribution of LULC classes is analyzed by calculating the areas for each class using the **MapBiomas Land Cover dataset** (Collection 8). Visualizations help to identify potential imbalances or inconsistencies that could affect the classification process.

### 5. **Stratified Sampling**  
Stratified sampling is applied to ensure that the training and testing datasets are balanced across different LULC classes. This approach helps mitigate biases in the model training and ensures that all classes are adequately represented.

### 6. **Supervised Classification**  
A **Random Forest** classification model is trained using the stratified samples. The feature importance is evaluated to understand which variables contribute most to the classification, and hyperparameters are fine-tuned to optimize the model's performance.

### 7. **Post-processing**  
After classification, **clustering techniques** are applied to smooth the outputs and reduce noise, particularly the "salt and pepper" effect, which is common in pixel-based classifications.

### 8. **Accuracy Assessment**  
The model's performance is assessed using **confusion matrices** and key accuracy metrics, including **overall accuracy**, **producer's accuracy** (recall), and **consumer's accuracy** (precision). These metrics provide valuable insights into misclassified classes and areas for improvement.

### 9. **Analyze and Visualize**  
Finally, the areas of each LULC class are calculated and presented in the form of visual summaries, including charts and tables. These visualizations allow for a clear comparison between the predicted and actual land cover distribution.

---

