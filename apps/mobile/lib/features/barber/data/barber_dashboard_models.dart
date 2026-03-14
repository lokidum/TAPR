class BarberDashboardStats {
  const BarberDashboardStats({
    required this.todayCount,
    required this.weekEarningsCents,
    required this.totalCuts,
    required this.averageRating,
    required this.level,
    this.title,
    required this.levelUpPending,
    required this.isOnCall,
    this.userName,
  });

  final int todayCount;
  final int weekEarningsCents;
  final int totalCuts;
  final double averageRating;
  final int level;
  final String? title;
  final bool levelUpPending;
  final bool isOnCall;
  final String? userName;

  factory BarberDashboardStats.fromJson(Map<String, dynamic> json) {
    return BarberDashboardStats(
      todayCount: (json['todayCount'] as num).toInt(),
      weekEarningsCents: (json['weekEarningsCents'] as num).toInt(),
      totalCuts: (json['totalCuts'] as num).toInt(),
      averageRating: (json['averageRating'] as num).toDouble(),
      level: (json['level'] as num).toInt(),
      title: json['title'] as String?,
      levelUpPending: json['levelUpPending'] as bool,
      isOnCall: json['isOnCall'] as bool,
      userName: json['userName'] as String?,
    );
  }

  String get formattedEarnings {
    final dollars = weekEarningsCents ~/ 100;
    final cents = weekEarningsCents % 100;
    return '\$${dollars.toString()}.${cents.toString().padLeft(2, '0')}';
  }

  String get firstName => userName?.split(' ').first ?? 'Barber';

  BarberDashboardStats copyWith({bool? isOnCall, bool? levelUpPending}) {
    return BarberDashboardStats(
      todayCount: todayCount,
      weekEarningsCents: weekEarningsCents,
      totalCuts: totalCuts,
      averageRating: averageRating,
      level: level,
      title: title,
      levelUpPending: levelUpPending ?? this.levelUpPending,
      isOnCall: isOnCall ?? this.isOnCall,
      userName: userName,
    );
  }
}

class UpcomingBookingCard {
  const UpcomingBookingCard({
    required this.id,
    required this.scheduledAt,
    required this.serviceType,
    required this.priceCents,
    required this.durationMinutes,
    required this.status,
    this.consumerName,
    this.consumerAvatarUrl,
  });

  final String id;
  final DateTime scheduledAt;
  final String serviceType;
  final int priceCents;
  final int durationMinutes;
  final String status;
  final String? consumerName;
  final String? consumerAvatarUrl;

  factory UpcomingBookingCard.fromJson(Map<String, dynamic> json) {
    final consumer = json['consumer'] as Map<String, dynamic>?;
    return UpcomingBookingCard(
      id: json['id'] as String,
      scheduledAt: DateTime.parse(json['scheduledAt'] as String),
      serviceType: json['serviceType'] as String,
      priceCents: (json['priceCents'] as num).toInt(),
      durationMinutes: (json['durationMinutes'] as num).toInt(),
      status: json['status'] as String,
      consumerName: consumer?['fullName'] as String?,
      consumerAvatarUrl: consumer?['avatarUrl'] as String?,
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
}
