class BookingDetail {
  const BookingDetail({
    required this.id,
    required this.consumerId,
    required this.barberId,
    this.studioId,
    this.serviceId,
    required this.serviceType,
    required this.status,
    required this.scheduledAt,
    required this.durationMinutes,
    required this.priceCents,
    required this.platformFeeCents,
    required this.barberPayoutCents,
    this.studioPayoutCents,
    this.cutRating,
    this.experienceRating,
    this.reviewText,
    this.reviewedAt,
    required this.createdAt,
    required this.updatedAt,
  });

  final String id;
  final String consumerId;
  final String barberId;
  final String? studioId;
  final String? serviceId;
  final String serviceType;
  final String status;
  final DateTime scheduledAt;
  final int durationMinutes;
  final int priceCents;
  final int platformFeeCents;
  final int barberPayoutCents;
  final int? studioPayoutCents;
  final int? cutRating;
  final int? experienceRating;
  final String? reviewText;
  final DateTime? reviewedAt;
  final DateTime createdAt;
  final DateTime updatedAt;

  factory BookingDetail.fromJson(Map<String, dynamic> json) {
    return BookingDetail(
      id: json['id'] as String,
      consumerId: json['consumerId'] as String,
      barberId: json['barberId'] as String,
      studioId: json['studioId'] as String?,
      serviceId: json['serviceId'] as String?,
      serviceType: json['serviceType'] as String,
      status: json['status'] as String,
      scheduledAt: DateTime.parse(json['scheduledAt'] as String),
      durationMinutes: (json['durationMinutes'] as num).toInt(),
      priceCents: (json['priceCents'] as num).toInt(),
      platformFeeCents: (json['platformFeeCents'] as num).toInt(),
      barberPayoutCents: (json['barberPayoutCents'] as num).toInt(),
      studioPayoutCents: json['studioPayoutCents'] != null
          ? (json['studioPayoutCents'] as num).toInt()
          : null,
      cutRating: json['cutRating'] != null
          ? (json['cutRating'] as num).toInt()
          : null,
      experienceRating: json['experienceRating'] != null
          ? (json['experienceRating'] as num).toInt()
          : null,
      reviewText: json['reviewText'] as String?,
      reviewedAt: json['reviewedAt'] != null
          ? DateTime.parse(json['reviewedAt'] as String)
          : null,
      createdAt: DateTime.parse(json['createdAt'] as String),
      updatedAt: DateTime.parse(json['updatedAt'] as String),
    );
  }

  String get formattedPrice {
    final dollars = priceCents ~/ 100;
    final cents = priceCents % 100;
    return '\$${dollars.toString()}.${cents.toString().padLeft(2, '0')}';
  }

  String get displayServiceType {
    switch (serviceType) {
      case 'in_studio':
        return 'Studio';
      case 'mobile':
        return 'Mobile';
      case 'on_call':
        return 'On Call';
      default:
        return serviceType;
    }
  }

  String get formattedDuration {
    if (durationMinutes >= 60) {
      final hours = durationMinutes ~/ 60;
      final mins = durationMinutes % 60;
      return mins > 0 ? '${hours}h ${mins}min' : '${hours}h';
    }
    return '${durationMinutes}min';
  }

  bool get canRaiseDispute {
    if (status != 'completed') return false;
    final sevenDaysAgo = DateTime.now().subtract(const Duration(days: 7));
    return updatedAt.isAfter(sevenDaysAgo);
  }
}
