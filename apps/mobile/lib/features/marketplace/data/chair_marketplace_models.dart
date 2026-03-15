class NearbyChairListing {
  const NearbyChairListing({
    required this.id,
    required this.studioId,
    required this.title,
    this.description,
    required this.priceCentsPerDay,
    this.priceCentsPerWeek,
    required this.availableFrom,
    required this.availableTo,
    required this.listingType,
    required this.minLevelRequired,
    required this.isSickCall,
    required this.sickCallPremiumPct,
    required this.status,
    required this.studioName,
    required this.distanceKm,
    required this.lat,
    required this.lng,
  });

  final String id;
  final String studioId;
  final String title;
  final String? description;
  final int priceCentsPerDay;
  final int? priceCentsPerWeek;
  final DateTime availableFrom;
  final DateTime availableTo;
  final String listingType;
  final int minLevelRequired;
  final bool isSickCall;
  final int sickCallPremiumPct;
  final String status;
  final String studioName;
  final double distanceKm;
  final double lat;
  final double lng;

  factory NearbyChairListing.fromJson(Map<String, dynamic> json) {
    return NearbyChairListing(
      id: json['id'] as String,
      studioId: json['studioId'] as String,
      title: json['title'] as String,
      description: json['description'] as String?,
      priceCentsPerDay: (json['priceCentsPerDay'] as num).toInt(),
      priceCentsPerWeek: json['priceCentsPerWeek'] != null
          ? (json['priceCentsPerWeek'] as num).toInt()
          : null,
      availableFrom: DateTime.parse(json['availableFrom'] as String),
      availableTo: DateTime.parse(json['availableTo'] as String),
      listingType: json['listingType'] as String,
      minLevelRequired: (json['minLevelRequired'] as num).toInt(),
      isSickCall: json['isSickCall'] as bool? ?? false,
      sickCallPremiumPct: (json['sickCallPremiumPct'] as num?)?.toInt() ?? 0,
      status: json['status'] as String,
      studioName: json['studioName'] as String,
      distanceKm: (json['distanceKm'] as num).toDouble(),
      lat: (json['lat'] as num).toDouble(),
      lng: (json['lng'] as num).toDouble(),
    );
  }

  /// Builds from GET /chairs/:id response (listing with nested studio).
  /// Uses 0 for distanceKm, lat, lng when not available.
  factory NearbyChairListing.fromDetailJson(Map<String, dynamic> json) {
    final studio = json['studio'] as Map<String, dynamic>?;
    final studioName = studio?['businessName'] as String? ?? '';

    return NearbyChairListing(
      id: json['id'] as String,
      studioId: json['studioId'] as String,
      title: json['title'] as String,
      description: json['description'] as String?,
      priceCentsPerDay: (json['priceCentsPerDay'] as num).toInt(),
      priceCentsPerWeek: json['priceCentsPerWeek'] != null
          ? (json['priceCentsPerWeek'] as num).toInt()
          : null,
      availableFrom: DateTime.parse(json['availableFrom'] as String),
      availableTo: DateTime.parse(json['availableTo'] as String),
      listingType: json['listingType'] as String,
      minLevelRequired: (json['minLevelRequired'] as num).toInt(),
      isSickCall: json['isSickCall'] as bool? ?? false,
      sickCallPremiumPct: (json['sickCallPremiumPct'] as num?)?.toInt() ?? 0,
      status: json['status'] as String,
      studioName: studioName,
      distanceKm: 0,
      lat: 0,
      lng: 0,
    );
  }

  String get formattedPricePerDay {
    final dollars = priceCentsPerDay ~/ 100;
    final cents = priceCentsPerDay % 100;
    return '\$${dollars.toString()}.${cents.toString().padLeft(2, '0')}/day';
  }

  String? get formattedPricePerWeek {
    if (priceCentsPerWeek == null) return null;
    final dollars = priceCentsPerWeek! ~/ 100;
    final cents = priceCentsPerWeek! % 100;
    return '\$${dollars.toString()}.${cents.toString().padLeft(2, '0')}/week';
  }

  String get listingTypeLabel {
    switch (listingType) {
      case 'daily':
        return 'Daily';
      case 'weekly':
        return 'Weekly';
      case 'sick_call':
        return 'Sick Call';
      case 'permanent':
        return 'Permanent';
      default:
        return listingType;
    }
  }
}

class ChairRentalResult {
  const ChairRentalResult({
    required this.rentalId,
    required this.clientSecret,
  });

  final String rentalId;
  final String clientSecret;

  factory ChairRentalResult.fromJson(Map<String, dynamic> json) {
    final rental = json['rental'] as Map<String, dynamic>;
    return ChairRentalResult(
      rentalId: rental['id'] as String,
      clientSecret: rental['clientSecret'] as String,
    );
  }
}
