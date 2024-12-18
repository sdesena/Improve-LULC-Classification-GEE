/*

Improve Land Use and Land Cover Classification in Google Earth Engine

Learn how to avoid pitfalls and enhance your analysis

Autor: Sandro De Sena Machado - Geospatial Data Scientist

*/

var geometry = 
    /* color: #0b4a8b */
    /* shown: false */
    ee.Geometry.Polygon(
        [[[-58.389544224642215, -11.200339407332578],
          [-58.389544224642215, -13.336554634910579],
          [-55.906634068392215, -13.336554634910579],
          [-55.906634068392215, -11.200339407332578]]], null, false);

/********************* PRE-PROCESSING ******************************/

// Function to maks cloud and shadows from Landsat 8
function maskL8sr(image) {
  // Bit 0 - Fill
  // Bit 1 - Dilated Cloud
  // Bit 2 - Cirrus
  // Bit 3 - Cloud
  // Bit 4 - Cloud Shadow
  var qaMask = image.select('QA_PIXEL').bitwiseAnd(parseInt('11111', 2)).eq(0);
  var saturationMask = image.select('QA_RADSAT').eq(0);

  // Apply scale factors and offset
  var opticalBands = image.select('SR_B.').multiply(0.0000275).add(-0.2);
  var thermalBands = image.select('ST_B.*').multiply(0.00341802).add(149.0);

  // Replace original bands by corrected ones and apply the masks
  return image.addBands(opticalBands, null, true)
      .addBands(thermalBands, null, true)
      .updateMask(qaMask)
      .updateMask(saturationMask);
}

// Function to create spectral indices
function indices (image) {
  // NDVI (Normalized Difference Vegetation Index)
  var ndvi =  image.normalizedDifference(['SR_B5', 'SR_B4']).rename('NDVI'); 
  
  // EVI (Enhanced Vegeation Index)
  var evi = image.expression(
    '2.5 * ((N - R) / (N + (6 * R) - (7.5 * B) + 1))', 
    { 'N': image.select('SR_B5'), 'R': image.select('SR_B4'), 'B': image.select('SR_B2')}
  ).rename('EVI');
  
  // NDWI (Normalized Difference Water Index)
  var ndwi = image.normalizedDifference(['SR_B3', 'SR_B5']).rename ('NDWI'); 
  
  // NDWI_VEG (Normalized Difference Water Index for Vegetation)
  var ndwi_veg = image.normalizedDifference(['SR_B5', 'SR_B6']).rename ('NDWI_VEG'); 
  
  // MNDWI (Modified Normalized Difference Water Index)
  var mndwi = image.normalizedDifference(['SR_B3', 'SR_B6']).rename('MNDWI'); 
  
  // NBR (Normalized Burn Ratio)
  var nbr = image.normalizedDifference(['SR_B5', 'SR_B7']).rename ('NBR'); 
  
  // Green Chlorophyll Vegetation Index (GCVI)
  var GCVI = image.expression(
    '(NIR / GREEN) - 1',
    {
      'NIR': image.select('SR_B5'),   // NIR
      'GREEN': image.select('SR_B3') // GREEN
    }
  ).rename('GCVI');
  
  // Hallcover Index (HALLCOVER) - tailored for Savannah Formation
  var HALLCOVER = image.expression(
    '(-RED * 0.017 - NIR * 0.007 - SWIR2 * 0.079 + 5.22)',
    {
      'RED': image.select('SR_B4'),   // RED
      'NIR': image.select('SR_B5'),   // NIR
      'SWIR2': image.select('SR_B7')  // SWIR2
    }
  ).rename('HALLCOVER');
  
  // Photochemical Reflectance Index (PRI)
  var PRI = image.expression(
    '(BLUE - GREEN) / (BLUE + GREEN)',
    {
      'BLUE': image.select('SR_B2'),  // BLUE
      'GREEN': image.select('SR_B3') // GREEN
    }
  ).rename('PRI');
  
  // Bare Soil Index (BSI)
  var BSI = image.expression(
    '((SWIR2 + RED) - (SWIR2 - BLUE)) / ((SWIR2 + RED) + (SWIR2 - BLUE))',
    {
      'SWIR2': image.select('SR_B7'), // SWIR2
      'RED': image.select('SR_B4'),   // RED
      'BLUE': image.select('SR_B2')   // BLUE
    }
  ).rename('BSI');

  
  // Add spectral indices as new bands in the image collection
  return image.addBands([ndvi, evi, ndwi, ndwi_veg, mndwi, nbr,GCVI,HALLCOVER,PRI,BSI]);
}


// Function to create annual mosaics, get metadata and apply grouped reducers
function createAnnualMosaic(year) {
  var startDate = ee.Date.fromYMD(year, 1, 1);
  var endDate = ee.Date.fromYMD(year, 12, 31);
  
  var landsatCollection = ee.ImageCollection("LANDSAT/LC08/C02/T1_L2")
                              .filterDate(startDate, endDate)
                              .map(maskL8sr)
                              .filter(ee.Filter.lt('CLOUD_COVER', 30))
                              .filterBounds(geometry);
  
  // Show image collection metadata
  print('Número de imagens da coleção para o ano ' + year + ':', landsatCollection.size());
  var range = landsatCollection.reduceColumns(ee.Reducer.minMax(), ['system:time_start']);
  print('Date range: ', ee.Date(range.get('min')), ee.Date(range.get('max')));

  // Apply indices function
  var indexedCollection = landsatCollection.map(indices);
  
  // Calculate statistical reducers
  var medianStats = indexedCollection.reduce(ee.Reducer.median());
  var stdDevStats = indexedCollection.reduce(ee.Reducer.stdDev());
  var minStats = indexedCollection.reduce(ee.Reducer.min());
  var maxStats = indexedCollection.reduce(ee.Reducer.max());

  // Combine reducers into a single image
  var mosaic = medianStats
    .addBands(stdDevStats)
    .addBands(minStats)
    .addBands(maxStats)
    .setDefaultProjection('EPSG:4326', null, 30)
    .select([
      'SR_B2_median', 'SR_B3_median', 'SR_B4_median', 'SR_B5_median', 'SR_B6_median', 'SR_B7_median',
      'NDVI_median', 'EVI_median', 'NDWI_median', 'NDWI_VEG_median', 'MNDWI_median', 'NBR_median', 
      'GCVI_median', 'HALLCOVER_median', 'PRI_median', 'BSI_median',
      'EVI_stdDev', 'NDVI_stdDev','GCVI_stdDev','PRI_stdDev', 'BSI_stdDev','HALLCOVER_stdDev',
      'NDVI_min', 'NDVI_max','GCVI_min', 'GCVI_max','PRI_min','PRI_max','EVI_min','EVI_max','MNDWI_max','MNDWI_min'
      ]);
  
  // Set system time start
  return mosaic.set('system:time_start', startDate.millis());
}


/*********************** VISUALIZE THE MOSAICS  **************************************/

// Apply the function to create a mosaic
var mosaic2017 = createAnnualMosaic(2017);

// Show the mosaic on the map
Map.centerObject(geometry, 10);
Map.addLayer(mosaic2017, {bands: ['SR_B4_median', 'SR_B3_median', 'SR_B2_median'], min: 0, max: 0.3}, 'Mosaico 2017');


// Clip the mosaic for the region of interest
var mosaic2017_clip = mosaic2017.clip(geometry)

// Show the cliped mosaic on the map
Map.addLayer(mosaic2017_clip, {bands: ['SR_B4_median', 'SR_B3_median', 'SR_B2_median'], min: 0, max: 0.3}, 'Mosaico 2017 (clip)',false);




/************** MAP BIOMAS COLLECTION 8 *****************/

// Get a reference dataset
var mapbiomas = 'projects/mapbiomas-public/assets/brazil/lulc/collection8/mapbiomas_collection80_integration_v1'

// Instaciante the dataset as an image
var mapbiomas = ee.Image(mapbiomas)
print('Dado mapbiomas', mapbiomas)

// Select the year of interest
var lulc_2017 = mapbiomas.select('classification_2017')

// Fetch the color palette
var palettes = require('users/mapbiomas/modules:Palettes.js').get('classification8');
var vis = {
  palette:palettes,
  min:0,
  max:62
}
print('Paleta de cores',palettes)

// Show the reference dataset on the map
Map.addLayer(lulc_2017,vis,'Uso e ocupação do solo - 2017',false)

// Clip the dataset for the region of interest
var lulc_2017_clip = lulc_2017.clip(geometry)
Map.addLayer(lulc_2017_clip,vis,'Uso e ocupação do solo - 2017 (clip)')




/******************  EXPLORATORY DATA ANALYSIS (EDA) *********************************/



// Calculate the area in square kilometers (km²) for each pixel
var areaImage_2017 = ee.Image.pixelArea().divide(1e6).addBands(lulc_2017_clip);

// Dictionary for class names and colors
var classesDict = {
  1: { name: 'Forest', color: '#32a65e' },
  3: { name: 'Forest Formation', color: '#1f8d49' },
  4: { name: 'Savanna Formation', color: '#7dc975' },
  5: { name: 'Mangrove', color: '#04381d' },
  6: { name: 'Floodable Forest (beta)', color: '#026975' },
  49: { name: 'Wooded Sandbank Vegetation', color: '#02d659' },
  10: { name: 'Non Forest Natural Formation', color: '#ad975a' },
  11: { name: 'Wetland', color: '#519799' },
  12: { name: 'Grassland', color: '#d6bc74' },
  32: { name: 'Hypersaline Tidal Flat', color: '#fc8114' },
  29: { name: 'Rocky Outcrop', color: '#ffaa5f' },
  50: { name: 'Herbaceous Sandbank Vegetation', color: '#ad5100' },
  13: { name: 'Other non Forest Formations', color: '#d89f5c' },
  14: { name: 'Farming', color: '#FFFFB2' },
  15: { name: 'Pasture', color: '#edde8e' },
  18: { name: 'Agriculture', color: '#E974ED' },
  19: { name: 'Temporary Crop', color: '#C27BA0' },
  39: { name: 'Soybean', color: '#f5b3c8' },
  20: { name: 'Sugar cane', color: '#db7093' },
  40: { name: 'Rice', color: '#c71585' },
  62: { name: 'Cotton (beta)', color: '#ff69b4' },
  41: { name: 'Other Temporary Crops', color: '#f54ca9' },
  36: { name: 'Perennial Crop', color: '#d082de' },
  46: { name: 'Coffee', color: '#d68fe2' },
  47: { name: 'Citrus', color: '#9932cc' },
  35: { name: 'Palm Oil (beta)', color: '#9065d0' },
  48: { name: 'Other Perennial Crops', color: '#e6ccff' },
  9: { name: 'Forest Plantation', color: '#7a5900' },
  21: { name: 'Mosaic of Uses', color: '#ffefc3' },
  22: { name: 'Non vegetated area', color: '#d4271e' },
  23: { name: 'Beach, Dune and Sand Spot', color: '#ffa07a' },
  24: { name: 'Urban Area', color: '#d4271e' },
  30: { name: 'Mining', color: '#9c0027' },
  25: { name: 'Other non Vegetated Areas', color: '#db4d4f' },
  26: { name: 'Water', color: '#0000FF' },
  33: { name: 'River, Lake and Ocean', color: '#2532e4' },
  31: { name: 'Aquaculture', color: '#091077' },
  27: { name: 'Not Observed', color: '#ffffff' },
  0: { name: 'Out of area of interest', color: '#808080' }
};

// Calculate total area by class using grouped reducer
var areaClass_2017 = areaImage_2017.reduceRegion({
  reducer: ee.Reducer.sum().group({
    groupField: 1,
    groupName: 'class'
  }),
  geometry: geometry,
  scale: 30,
  bestEffort: true,
  maxPixels: 1e13,
  tileScale: 16
});

// Convert results to a list with class names and areas
var areaListWithInfo = ee.List(areaClass_2017.get('groups')).map(function(item) {
  item = ee.Dictionary(item);
  var classValue = ee.Number(item.get('class'));
  var areaKm2 = item.get('sum');
  
  // Add class name and color information from the dictionary
  var classInfo = ee.Dictionary(classesDict).get(classValue);
  return ee.Feature(null, {
    'class': classValue,
    'name': ee.Dictionary(classInfo).get('name'),
    'area_km2': areaKm2
  });
});

// Convert the list to a FeatureCollection
var areaFeatureCollection = ee.FeatureCollection(areaListWithInfo);

// Create and print a table summarizing class names and areas
var areaTable = ui.Chart.feature.byFeature({
  features: areaFeatureCollection,
  xProperty: 'name', // Class name
  yProperties: ['area_km2'] // Area in km²
}).setChartType('Table')
  .setOptions({
    title: 'Class Areas for 2017 (km²)',
    columns: [
      { label: 'Class Name', type: 'string' },
      { label: 'Area (km²)', type: 'number' }
    ]
  });

// Output the table
print(areaTable);





/***************************** STRATIFIED SAMPLING *************************/


// Image with reference dataset
var classificationImage = lulc_2017_clip

// Scale (in meters)
var scale = 30;

var region = geometry;

// Calculate the area of each class
var classAreas = classificationImage
  .reduceRegion({
    reducer: ee.Reducer.frequencyHistogram(),
    geometry: region,
    scale: scale,
    maxPixels: 1e13
  }).get('classification_2017');

print('Pixel frequency per class)', classAreas);

// Transform the object into a dictionary
classAreas = ee.Dictionary(classAreas);

// Get unique class values and it's areas
var classValues = classAreas.keys().map(ee.Number.parse);
var areas = classAreas.values();

// Calculate total area per class
var totalArea = areas.reduce(ee.Reducer.sum());


// Get a proportion for each class
var numTotalPoints = 2000; 
var minPoints = 7;        
var maxPoints = 1000;       

var classPoints = areas.map(function(area) {
  var proportion = ee.Number(area).divide(totalArea); 
  var points = proportion.multiply(numTotalPoints).round(); 
  return points.clamp(minPoints, maxPoints); 
});


print('Reference dataset classes', classValues);
print('Number of samples per class', classPoints);

// Create stratified samples
var stratifiedSamples = classificationImage.stratifiedSample({
  numPoints: 0, 
  classBand: 'classification_2017',
  region: region,
  scale: scale,
  seed: 42,
  classValues: classValues,
  classPoints: classPoints,
  geometries: true 
});

print('Stratified samples', stratifiedSamples);
Map.addLayer(stratifiedSamples, {}, 'Samples',false);


var samples = stratifiedSamples;



// Create a column with random numbers to split the dataset
var gcp = samples.randomColumn();
var split = 0.7;


// Split with Stratified Random Sampling
// Split features into training / validation sets, per class
var classes = ee.List(gcp.aggregate_array('classification_2017').distinct());

var getSplitSamples = function(classNumber) {
  var classSamples = gcp
    .filter(ee.Filter.eq('classification_2017', classNumber))
    .randomColumn('random');

  // Split the samples, 60% for training, 40% for validation
  var classTrainingGcp = classSamples
    .filter(ee.Filter.lt('random', split))
    // Set a property to identify the fraction
    .map(function(f) {return f.set('fraction', 'training')});
    
  var classValidationGcp = classSamples
    .filter(ee.Filter.gte('random', split))
    .map(function(f) {return f.set('fraction', 'validation')});
  return classTrainingGcp.merge(classValidationGcp);
};

// map() the function on the list of classes
var splitSamples = ee.FeatureCollection(classes.map(getSplitSamples))
  .flatten();

// Filter using the 'fraction' property
var trainingGcpStratified = splitSamples.filter(
  ee.Filter.eq('fraction', 'training'));
var validationGcpStratified = splitSamples.filter(
  ee.Filter.eq('fraction', 'validation'));

// Validate the results

// Function to calculate distribution of samples
var getDistribution = function(fc) {
  return fc.reduceColumns({
    reducer: ee.Reducer.frequencyHistogram(),
    selectors: ['classification_2017']}).get('histogram');
};

print('Distribution of All Samples by Class', getDistribution(gcp));

print('Training (Stratified Split)',
  getDistribution(trainingGcpStratified));

print('Validation (Stratified Split)',
  getDistribution(validationGcpStratified));
  



/******************* TREINAMENTO E CLASSIFICAÇÃO ****************************/

// Combine the mosaic with the reference dataset to 
// stack target and predictors variables into a single image
var dataset = mosaic2017_clip.addBands(lulc_2017_clip)


// Extract the variables values using the training set

var training = dataset.sampleRegions({
  collection: trainingGcpStratified, 
  properties: ['classification_2017'], 
  scale: 30, 
  tileScale: 16 
});

// Print the first 100 samples in the console
print('Check the samples', training.limit(100));


// Train the classifier
var classifier = ee.Classifier.smileRandomForest({
                              numberOfTrees: 1000,
                              //variablesPerSplit: 10,
                              //bagFraction: 0.7,
                              //minLeafPopulation: 2,
                              seed: 123, 
}).train({
  features: training,
  classProperty: 'classification_2017',
      inputProperties: ['SR_B2_median', 'SR_B3_median', 'SR_B4_median', 'SR_B5_median', 'SR_B6_median', 'SR_B7_median',
      'NDVI_median', 'EVI_median', 'NDWI_median', 'NDWI_VEG_median', 'MNDWI_median', 'NBR_median', 
      'GCVI_median', 'HALLCOVER_median', 'PRI_median', 'BSI_median',
      'EVI_stdDev', 'NDVI_stdDev','GCVI_stdDev','PRI_stdDev', 'BSI_stdDev','HALLCOVER_stdDev',
      'NDVI_min', 'NDVI_max','GCVI_min', 'GCVI_max','PRI_min','PRI_max','EVI_min','EVI_max']
});


// Classify the image for the specific year
var classified_2017 = mosaic2017_clip.classify(classifier);
Map.addLayer(classified_2017,vis, 'LULC Classification (2017)')




//************************************************************************** 
// Feature Importance
//************************************************************************** 

// Run .explain() to see what the classifer looks like
print(classifier.explain())

// Calculate variable importance
var importance = ee.Dictionary(classifier.explain().get('importance'))

// Calculate relative importance
var sum = importance.values().reduce(ee.Reducer.sum())

var relativeImportance = importance.map(function(key, val) {
  return (ee.Number(val).multiply(100)).divide(sum)
  })
print(relativeImportance)

// Create a FeatureCollection so we can chart it
var importanceFc = ee.FeatureCollection([
  ee.Feature(null, relativeImportance)
])

var chart = ui.Chart.feature.byProperty({
  features: importanceFc
}).setOptions({
      title: 'Feature Importance',
      vAxis: {title: 'Importance'},
      hAxis: {title: 'Feature'}
  })
print(chart)





//************************************************************************** 
// Hyperparameter Tuning
//************************************************************************** 

var test = dataset.sampleRegions({
  collection: validationGcpStratified,
  properties: ['classification_2017'],
  scale: 30,
  tileScale: 16
});


// Tune the numberOfTrees parameter.
var numTreesList = ee.List.sequence(10, 150, 10);

var accuracies = numTreesList.map(function(numTrees) {
  var classifier = ee.Classifier.smileRandomForest(numTrees)
      .train({
        features: training,
        classProperty: 'classification_2017',
        inputProperties: dataset.bandNames()
      });

  // Here we are classifying a table instead of an image
  // Classifiers work on both images and tables
  return test
    .classify(classifier)
    .errorMatrix('classification_2017', 'classification')
    .accuracy();
});

var chart = ui.Chart.array.values({
  array: ee.Array(accuracies),
  axis: 0,
  xLabels: numTreesList
  }).setOptions({
      title: 'Hyperparameter Tuning for the numberOfTrees Parameters',
      vAxis: {title: 'Validation Accuracy'},
      hAxis: {title: 'Number of Tress', gridlines: {count: 15}}
  });
print(chart)

// Tuning Multiple Parameters
// We can tune many parameters together using
// nested map() functions
// Let's tune 2 parameters
// numTrees and bagFraction 
var numTreesList = ee.List.sequence(10, 150, 10);
var bagFractionList = ee.List.sequence(0.1, 0.9, 0.1);

var accuracies = numTreesList.map(function(numTrees) {
  return bagFractionList.map(function(bagFraction) {
    var classifier = ee.Classifier.smileRandomForest({
      numberOfTrees: numTrees,
      bagFraction: bagFraction
    })
      .train({
        features: training,
        classProperty: 'classification_2017',
        inputProperties: dataset.bandNames()
      });

    // Here we are classifying a table instead of an image
    // Classifiers work on both images and tables
    var accuracy = test
      .classify(classifier)
      .errorMatrix('classification_2017', 'classification')
      .accuracy();
    return ee.Feature(null, {'accuracy': accuracy,
      'numberOfTrees': numTrees,
      'bagFraction': bagFraction})
  })
}).flatten()
var resultFc = ee.FeatureCollection(accuracies)

// // Export the result as CSV
// Export.table.toDrive({
//   collection: resultFc,
//   description: 'Multiple_Parameter_Tuning_Results',
//   folder: 'earthengine',
//   fileNamePrefix: 'numtrees_bagfraction',
//   fileFormat: 'CSV'});

// Alternatively we can automatically pick the parameters
// that result in the highest accuracy
var resultFcSorted = resultFc.sort('accuracy', false);
var highestAccuracyFeature = resultFcSorted.first();
var highestAccuracy = highestAccuracyFeature.getNumber('accuracy');
var optimalNumTrees = highestAccuracyFeature.getNumber('numberOfTrees');
var optimalBagFraction = highestAccuracyFeature.getNumber('bagFraction');

// Use the optimal parameters in a model and perform final classification
var optimalModel = ee.Classifier.smileRandomForest({
  numberOfTrees: optimalNumTrees,
  bagFraction: optimalBagFraction
}).train({
  features: training,  
  classProperty: 'classification_2017',
  inputProperties: dataset.bandNames()
});

var finalClassification = dataset.classify(optimalModel);

// Printing or Displaying the image may time out as it requires
// extensive computation to find the optimal parameters

// Export the 'finalClassification' to Asset and import the
// result to view it.





/***************************************  POST-PROCESSING ************************************************************/


//************************************************************************** 
// Post process by replacing isolated pixels with surrounding value
//************************************************************************** 

// count patch sizes
var patchsize = classified_2017.connectedPixelCount(80, true);

// run a majority filter
var filtered = classified_2017.focal_mode({
    radius: 60,
    kernelType: 'square',
    units: 'meters',
}); 
  
// updated image with majority filter where patch size is small
var connectedClassified =  classified_2017.where(patchsize.lt(70),filtered);
Map.addLayer(connectedClassified, vis, 
  'Processed using Connected Pixels');



/******************* ACCURACY ASSESSMENT ****************************/


// Test the classifier with the validation set
var test = classified_2017.sampleRegions({
  collection: validationGcpStratified,
  properties: ['classification_2017'],
  scale: 30,
  tileScale: 16
});


// Create a confusion matrix
var testConfusionMatrix = test.errorMatrix('classification_2017', 'classification');

// Print overall accuraccy
print('Overall accuracy', testConfusionMatrix.accuracy());

// Print consumer's accuracy
print('Consumers accuracy', testConfusionMatrix.consumersAccuracy());

// Print producer's accuracy
print('Producers accuracy', testConfusionMatrix.producersAccuracy());

// Print Kappa Index
print('Kappa index', testConfusionMatrix.kappa());



/**************** Assessing the tuner model *******************/

// Test the tuner model with the validation set
var test_2 = finalClassification.sampleRegions({
  collection: validationGcpStratified,
  properties: ['classification_2017'],
  scale: 30,
  tileScale: 16
});



// Print confusion matrix
var testConfusionMatrix_tuned = test_2.errorMatrix('classification_2017', 'classification');

// Print overall accuracy
print('Tuned model overall accuracy', testConfusionMatrix_tuned.accuracy());

// Print consumer's accuracy
print('Tuned model consumers accuracy', testConfusionMatrix_tuned.consumersAccuracy());

// Print consumer's accuracy
print('Tuned model producers accuracy', testConfusionMatrix_tuned.producersAccuracy());

// Print Kappa Index
print('Tuned model Kappa Index', testConfusionMatrix_tuned.kappa());



/**************** Avaliando a imagem pós-processada *******************/


// // Avaliar a acurácia utilizando o conjunto de validação
// var test3 = connectedClassified.sampleRegions({
//   collection: validationGcpStratified,
//   properties: ['classification_2017'],
//   scale: 30,
//   tileScale: 16
// });


// // Geração da Matriz de Confusão para o Conjunto de Teste
// var testConfusionMatrix_connected = test3.errorMatrix('classification_2017', 'classification');

// // Verificar as métricas de acurácia

// // Calcula e imprime a acurácia global do modelo no conjunto de teste
// print('Acurácia no conjunto de teste (Pós-processado)', testConfusionMatrix_connected.accuracy());

// // // Calcula e imprime a acurácia do consumidor (ou acurácia do usuário) para cada classe.
// // print('Acurácia do Consumidor (Pós-processado)', testConfusionMatrix_connected.consumersAccuracy());

// // // Calcula e imprime a acurácia do produtor _tunedpara cada classe.
// // print('Acurácia do Produtor (Pós-processado)', testConfusionMatrix_connected.producersAccuracy());

// // Calcula e imprime o índice Kappa, que mede a concordância entre as classificações
// // considerando as classificações aleatórias. Um índice Kappa mais próximo de 1 indica maior concordância.
// print('Índice Kappa (Pós-processado)', testConfusionMatrix_connected.kappa());



// //************************************************************************** 
// // Exporting Results
// //************************************************************************** 

// // Export the classified image to Drive

// // For images having integers (such as class numbers)
// // we cast the image to floating point data type which
// // allows the masked values to be saved as NaN values
// // in the GeoTIFF format.
// // You can set these to actual NoData values using
// // GDAL tools after the export
// // gdal_translate -a_nodata 'nan' input.tif output.tif
// Export.image.toDrive({
//   image: finalClassification.clip(geometry).toFloat(),
//   description: 'Classified__tuned_Image_Export',
//   folder: 'earthengine',
//   fileNamePrefix: 'classified',
//   region: geometry,
//   scale: 30,
//   maxPixels: 1e10
// })

// // // Export the results of accuracy asssessment

// // Create a Feature with null geometry and the value we want to export.
// // Use .array() to convert Confusion Matrix to an Array so it can be
// // exported in a CSV file
// var fc = ee.FeatureCollection([
//   ee.Feature(null, {
//     'accuracy': testConfusionMatrix_tuned.accuracy(),
//     'matrix': testConfusionMatrix_tuned.array()
//   })
// ]);

// print(fc);

// Export.table.toDrive({
//   collection: fc,
//   description: 'Accuracy_Assessment_Export',
//   folder: 'earthengine',
//   fileNamePrefix: 'accuracy',
//   fileFormat: 'CSV'
// });



/******************* ANALYZE AND VISUALIZE CLASS AREAS ****************************/

// Calculate class areas
var areaImage_2017 = ee.Image.pixelArea().divide(1e6).addBands(classified_2017);

// Group by class to sum area for each class
var areaClass_2017 = areaImage_2017.reduceRegion({
      reducer: ee.Reducer.sum().group({
      groupField: 1,
      groupName: 'classification',
    }),
    geometry: geometry,
    scale: 300,
    bestEffort: true,
    maxPixels: 1e13,
    tileScale:16
    }); 

var classAreas_2017 = ee.List(areaClass_2017.get('groups'))
print('Classified area in km² - 2017',classAreas_2017)


// Dictionaty with names and colors
var classesDict = {
  1: {name: 'Forest', color: '#32a65e'},
  3: {name: 'Forest Formation', color: '#1f8d49'},
  4: {name: 'Savanna Formation', color: '#7dc975'},
  5: {name: 'Mangrove', color: '#04381d'},
  6: {name: 'Floodable Forest (beta)', color: '#026975'},
  49: {name: 'Wooded Sandbank Vegetation', color: '#02d659'},
  10: {name: 'Non Forest Natural Formation', color: '#ad975a'},
  11: {name: 'Wetland', color: '#519799'},
  12: {name: 'Grassland', color: '#d6bc74'},
  32: {name: 'Hypersaline Tidal Flat', color: '#fc8114'},
  29: {name: 'Rocky Outcrop', color: '#ffaa5f'},
  50: {name: 'Herbaceous Sandbank Vegetation', color: '#ad5100'},
  13: {name: 'Other non Forest Formations', color: '#d89f5c'},
  14: {name: 'Farming', color: '#FFFFB2'},
  15: {name: 'Pasture', color: '#edde8e'},
  18: {name: 'Agriculture', color: '#E974ED'},
  19: {name: 'Temporary Crop', color: '#C27BA0'},
  39: {name: 'Soybean', color: '#f5b3c8'},
  20: {name: 'Sugar cane', color: '#db7093'},
  40: {name: 'Rice', color: '#c71585'},
  62: {name: 'Cotton (beta)', color: '#ff69b4'},
  41: {name: 'Other Temporary Crops', color: '#f54ca9'},
  36: {name: 'Perennial Crop', color: '#d082de'},
  46: {name: 'Coffee', color: '#d68fe2'},
  47: {name: 'Citrus', color: '#9932cc'},
  35: {name: 'Palm Oil (beta)', color: '#9065d0'},
  48: {name: 'Other Perennial Crops', color: '#e6ccff'},
  9: {name: 'Forest Plantation', color: '#7a5900'},
  21: {name: 'Mosaic of Uses', color: '#ffefc3'},
  22: {name: 'Non vegetated area', color: '#d4271e'},
  23: {name: 'Beach, Dune and Sand Spot', color: '#ffa07a'},
  24: {name: 'Urban Area', color: '#d4271e'},
  30: {name: 'Mining', color: '#9c0027'},
  25: {name: 'Other non Vegetated Areas', color: '#db4d4f'},
  26: {name: 'Water', color: '#0000FF'},
  33: {name: 'River, Lake and Ocean', color: '#2532e4'},
  31: {name: 'Aquaculture', color: '#091077'},
  27: {name: 'Not Observed', color: '#ffffff'},
  0: {name: 'Out of area of interest', color: '#808080'}
};



// Add name and color for each class
var areaListWithInfo = classAreas_2017.map(function(item) {
  item = ee.Dictionary(item);
  var classValue = ee.Number(item.get('classification'));
  var areaHa = item.get('sum');
  
  var classInfo = ee.Dictionary(classesDict).get(classValue);
  return ee.Feature(null, {
    'classification': classValue,
    'sum': areaHa,
    'name': ee.Dictionary(classInfo).get('name'),
    'color': ee.Dictionary(classInfo).get('color')
  });
});

// Transform it into a feature collection
var areaFeatureCollection = ee.FeatureCollection(areaListWithInfo);
print('Lista de áreas por classe com informações:', areaFeatureCollection);


// Create a pizza chart
var pieChart = ui.Chart.feature.byFeature({
  features: areaFeatureCollection,
  xProperty: 'name', 
  yProperties: ['sum'] 
}).setChartType('PieChart') 
.setOptions({
  title: 'Percentage of Area by Land Use Class - 2017',
  slices: areaFeatureCollection.aggregate_array('color').getInfo().map(function(color, index) {
    return { color: color };
  }),
  pieHole:0.3
});

// Show the chart in the console
print(pieChart);

// Create a table based on the feature collection
var chart_table_2017 = ui.Chart.feature.byFeature({
  features: areaFeatureCollection, 
  xProperty: 'name', 
  yProperties: ['sum'] 
}).setChartType('Table')
.setOptions({
  title: 'Área das Classes em 2017',
  columns: [
    { label: 'Classe de Uso do Solo', type: 'string' },
    { label: 'Área (km²)', type: 'number' }
  ]
});

// Show the table in the console
print(chart_table_2017, 'Área das Classes em 2017');




