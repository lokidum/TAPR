class BarberServiceModel {
  const BarberServiceModel({
    required this.id,
    required this.name,
    this.description,
    required this.durationMinutes,
    required this.priceCents,
    required this.isActive,
  });

  final String id;
  final String name;
  final String? description;
  final int durationMinutes;
  final int priceCents;
  final bool isActive;

  factory BarberServiceModel.fromJson(Map<String, dynamic> json) {
    return BarberServiceModel(
      id: json['id'] as String,
      name: json['name'] as String,
      description: json['description'] as String?,
      durationMinutes: (json['durationMinutes'] as num).toInt(),
      priceCents: (json['priceCents'] as num).toInt(),
      isActive: json['isActive'] as bool,
    );
  }

  String get formattedPrice {
    final dollars = priceCents ~/ 100;
    final cents = priceCents % 100;
    return '\$${dollars.toString()}.${cents.toString().padLeft(2, '0')}';
  }

  String get formattedDuration {
    if (durationMinutes >= 60) {
      final hours = durationMinutes ~/ 60;
      final mins = durationMinutes % 60;
      return mins > 0 ? '${hours}h ${mins}min' : '${hours}h';
    }
    return '${durationMinutes}min';
  }
}

class BookedSlot {
  const BookedSlot({
    required this.startTime,
    required this.endTime,
  });

  final String startTime;
  final String endTime;

  factory BookedSlot.fromJson(Map<String, dynamic> json) {
    return BookedSlot(
      startTime: json['startTime'] as String,
      endTime: json['endTime'] as String,
    );
  }
}

class BookingResult {
  const BookingResult({
    required this.bookingId,
    required this.clientSecret,
    required this.status,
    required this.scheduledAt,
    required this.durationMinutes,
    required this.priceCents,
    required this.platformFeeCents,
    required this.barberPayoutCents,
  });

  final String bookingId;
  final String clientSecret;
  final String status;
  final String scheduledAt;
  final int durationMinutes;
  final int priceCents;
  final int platformFeeCents;
  final int barberPayoutCents;

  factory BookingResult.fromJson(Map<String, dynamic> json) {
    final booking = json['booking'] as Map<String, dynamic>;
    return BookingResult(
      bookingId: booking['id'] as String,
      clientSecret: json['clientSecret'] as String,
      status: booking['status'] as String,
      scheduledAt: booking['scheduledAt'] as String,
      durationMinutes: (booking['durationMinutes'] as num).toInt(),
      priceCents: (booking['priceCents'] as num).toInt(),
      platformFeeCents: (booking['platformFeeCents'] as num).toInt(),
      barberPayoutCents: (booking['barberPayoutCents'] as num).toInt(),
    );
  }
}
