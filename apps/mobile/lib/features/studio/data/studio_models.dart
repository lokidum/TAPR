class StudioProfile {
  const StudioProfile({
    required this.id,
    required this.userId,
    required this.businessName,
    this.abn,
    this.addressLine1,
    this.addressLine2,
    this.suburb,
    this.state,
    this.postcode,
    this.googlePlaceId,
    this.phone,
    this.websiteUrl,
    required this.chairCount,
    required this.isVerified,
    required this.createdAt,
    required this.updatedAt,
    this.lat,
    this.lng,
  });

  final String id;
  final String userId;
  final String businessName;
  final String? abn;
  final String? addressLine1;
  final String? addressLine2;
  final String? suburb;
  final String? state;
  final String? postcode;
  final String? googlePlaceId;
  final String? phone;
  final String? websiteUrl;
  final int chairCount;
  final bool isVerified;
  final DateTime createdAt;
  final DateTime updatedAt;
  final double? lat;
  final double? lng;

  factory StudioProfile.fromJson(Map<String, dynamic> json) {
    return StudioProfile(
      id: json['id'] as String,
      userId: json['userId'] as String,
      businessName: json['businessName'] as String,
      abn: json['abn'] as String?,
      addressLine1: json['addressLine1'] as String?,
      addressLine2: json['addressLine2'] as String?,
      suburb: json['suburb'] as String?,
      state: json['state'] as String?,
      postcode: json['postcode'] as String?,
      googlePlaceId: json['googlePlaceId'] as String?,
      phone: json['phone'] as String?,
      websiteUrl: json['websiteUrl'] as String?,
      chairCount: (json['chairCount'] as num).toInt(),
      isVerified: json['isVerified'] as bool? ?? false,
      createdAt: DateTime.parse(json['createdAt'] as String),
      updatedAt: DateTime.parse(json['updatedAt'] as String),
      lat: (json['lat'] as num?)?.toDouble(),
      lng: (json['lng'] as num?)?.toDouble(),
    );
  }
}

class StudioStats {
  const StudioStats({
    required this.totalChairs,
    required this.rentalsThisMonth,
    required this.revenueThisMonth,
    required this.occupancyRate,
  });

  final int totalChairs;
  final int rentalsThisMonth;
  final int revenueThisMonth;
  final double occupancyRate;

  factory StudioStats.fromJson(Map<String, dynamic> json) {
    return StudioStats(
      totalChairs: (json['totalChairs'] as num).toInt(),
      rentalsThisMonth: (json['rentalsThisMonth'] as num).toInt(),
      revenueThisMonth: (json['revenueThisMonth'] as num).toInt(),
      occupancyRate: (json['occupancyRate'] as num).toDouble(),
    );
  }
}

class StudioChairListing {
  const StudioChairListing({
    required this.id,
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
    required this.rentalCount,
    required this.createdAt,
  });

  final String id;
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
  final int rentalCount;
  final DateTime createdAt;

  factory StudioChairListing.fromJson(Map<String, dynamic> json) {
    return StudioChairListing(
      id: json['id'] as String,
      title: json['title'] as String,
      description: json['description'] as String?,
      priceCentsPerDay: (json['priceCentsPerDay'] as num).toInt(),
      priceCentsPerWeek: json['priceCentsPerWeek'] != null
          ? (json['priceCentsPerWeek'] as num).toInt()
          : null,
      availableFrom: DateTime.parse(json['availableFrom'] as String),
      availableTo: DateTime.parse(json['availableTo'] as String),
      listingType: json['listingType'] as String,
      minLevelRequired: (json['minLevelRequired'] as num?)?.toInt() ?? 1,
      isSickCall: json['isSickCall'] as bool? ?? false,
      sickCallPremiumPct: (json['sickCallPremiumPct'] as num?)?.toInt() ?? 0,
      status: json['status'] as String,
      rentalCount: (json['rentalCount'] as num?)?.toInt() ?? 0,
      createdAt: DateTime.parse(json['createdAt'] as String),
    );
  }

  String get statusLabel {
    switch (status) {
      case 'available':
        return 'Available';
      case 'reserved':
        return 'Reserved';
      case 'occupied':
        return 'Occupied';
      default:
        return status;
    }
  }

  String get formattedPricePerDay {
    final dollars = priceCentsPerDay ~/ 100;
    final cents = priceCentsPerDay % 100;
    return '\$$dollars.${cents.toString().padLeft(2, '0')}/day';
  }
}

class StudioRentalSummary {
  const StudioRentalSummary({
    required this.id,
    required this.barberName,
    this.barberAvatarUrl,
    required this.listingTitle,
    required this.startAt,
    required this.endAt,
    required this.status,
  });

  final String id;
  final String barberName;
  final String? barberAvatarUrl;
  final String listingTitle;
  final DateTime startAt;
  final DateTime endAt;
  final String status;

  factory StudioRentalSummary.fromJson(Map<String, dynamic> json) {
    return StudioRentalSummary(
      id: json['id'] as String,
      barberName: json['barberName'] as String? ?? 'Unknown',
      barberAvatarUrl: json['barberAvatarUrl'] as String?,
      listingTitle: json['listingTitle'] as String,
      startAt: DateTime.parse(json['startAt'] as String),
      endAt: DateTime.parse(json['endAt'] as String),
      status: json['status'] as String,
    );
  }

  String get statusLabel {
    switch (status) {
      case 'active':
        return 'Active';
      case 'completed':
        return 'Completed';
      case 'disputed':
        return 'Disputed';
      case 'cancelled':
        return 'Cancelled';
      default:
        return status;
    }
  }
}
