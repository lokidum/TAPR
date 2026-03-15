enum EventType {
  workshop,
  liveActivation,
  popUp,
  guestSpot;

  static EventType fromString(String value) {
    return switch (value) {
      'workshop' => EventType.workshop,
      'live_activation' => EventType.liveActivation,
      'pop_up' => EventType.popUp,
      'guest_spot' => EventType.guestSpot,
      _ => EventType.workshop,
    };
  }

  String get label {
    return switch (this) {
      EventType.workshop => 'Workshop',
      EventType.liveActivation => 'Live Activation',
      EventType.popUp => 'Pop-up',
      EventType.guestSpot => 'Guest Spot',
    };
  }

  String get apiValue {
    return switch (this) {
      EventType.workshop => 'workshop',
      EventType.liveActivation => 'live_activation',
      EventType.popUp => 'pop_up',
      EventType.guestSpot => 'guest_spot',
    };
  }
}

enum EventStatus {
  planning,
  confirmed,
  live,
  completed,
  cancelled;

  static EventStatus fromString(String value) {
    return switch (value) {
      'planning' => EventStatus.planning,
      'confirmed' => EventStatus.confirmed,
      'live' => EventStatus.live,
      'completed' => EventStatus.completed,
      'cancelled' => EventStatus.cancelled,
      _ => EventStatus.planning,
    };
  }
}

class EventListItem {
  const EventListItem({
    required this.id,
    required this.title,
    this.description,
    required this.eventType,
    this.locationAddress,
    required this.startsAt,
    required this.endsAt,
    this.maxAttendees,
    required this.ticketPriceCents,
    required this.hasFoodTrucks,
    required this.status,
    this.coverImageUrl,
    this.lat,
    this.lng,
    this.distanceKm,
    this.studioId,
    required this.organizerUserId,
  });

  final String id;
  final String title;
  final String? description;
  final EventType eventType;
  final String? locationAddress;
  final DateTime startsAt;
  final DateTime endsAt;
  final int? maxAttendees;
  final int ticketPriceCents;
  final bool hasFoodTrucks;
  final EventStatus status;
  final String? coverImageUrl;
  final double? lat;
  final double? lng;
  final double? distanceKm;
  final String? studioId;
  final String organizerUserId;

  factory EventListItem.fromJson(Map<String, dynamic> json) {
    return EventListItem(
      id: json['id'] as String,
      title: json['title'] as String,
      description: json['description'] as String?,
      eventType: EventType.fromString(json['eventType'] as String),
      locationAddress: json['locationAddress'] as String?,
      startsAt: DateTime.parse(json['startsAt'] as String),
      endsAt: DateTime.parse(json['endsAt'] as String),
      maxAttendees: (json['maxAttendees'] as num?)?.toInt(),
      ticketPriceCents: (json['ticketPriceCents'] as num?)?.toInt() ?? 0,
      hasFoodTrucks: json['hasFoodTrucks'] as bool? ?? false,
      status: EventStatus.fromString(json['status'] as String),
      coverImageUrl: json['coverImageUrl'] as String?,
      lat: (json['lat'] as num?)?.toDouble(),
      lng: (json['lng'] as num?)?.toDouble(),
      distanceKm: (json['distanceKm'] as num?)?.toDouble(),
      studioId: json['studioId'] as String?,
      organizerUserId: json['organizerUserId'] as String,
    );
  }

  String get formattedPrice {
    if (ticketPriceCents == 0) return 'Free';
    final dollars = ticketPriceCents ~/ 100;
    final cents = ticketPriceCents % 100;
    return '\$${dollars.toString()}.${cents.toString().padLeft(2, '0')}';
  }
}

class EventAttendeePreview {
  const EventAttendeePreview({
    required this.userId,
    this.avatarUrl,
    required this.firstName,
  });

  final String userId;
  final String? avatarUrl;
  final String firstName;

  factory EventAttendeePreview.fromJson(Map<String, dynamic> json) {
    return EventAttendeePreview(
      userId: json['userId'] as String,
      avatarUrl: json['avatarUrl'] as String?,
      firstName: json['firstName'] as String,
    );
  }
}

class EventDetail extends EventListItem {
  const EventDetail({
    required super.id,
    required super.title,
    super.description,
    required super.eventType,
    super.locationAddress,
    required super.startsAt,
    required super.endsAt,
    super.maxAttendees,
    required super.ticketPriceCents,
    required super.hasFoodTrucks,
    required super.status,
    super.coverImageUrl,
    super.lat,
    super.lng,
    super.distanceKm,
    super.studioId,
    required super.organizerUserId,
    this.organizerFullName,
    this.organizerAvatarUrl,
    this.studioBusinessName,
    this.studioAvatarUrl,
    required this.attendeeCount,
    this.attendees = const [],
  }) : super();

  final String? organizerFullName;
  final String? organizerAvatarUrl;
  final String? studioBusinessName;
  final String? studioAvatarUrl;
  final int attendeeCount;
  final List<EventAttendeePreview> attendees;

  factory EventDetail.fromJson(Map<String, dynamic> json) {
    final organizer = json['organizer'] as Map<String, dynamic>?;
    final studio = json['studio'] as Map<String, dynamic>?;
    final attendeesRaw = json['attendees'] as List<dynamic>? ?? [];
    return EventDetail(
      id: json['id'] as String,
      title: json['title'] as String,
      description: json['description'] as String?,
      eventType: EventType.fromString(json['eventType'] as String),
      locationAddress: json['locationAddress'] as String?,
      startsAt: DateTime.parse(json['startsAt'] as String),
      endsAt: DateTime.parse(json['endsAt'] as String),
      maxAttendees: (json['maxAttendees'] as num?)?.toInt(),
      ticketPriceCents: (json['ticketPriceCents'] as num?)?.toInt() ?? 0,
      hasFoodTrucks: json['hasFoodTrucks'] as bool? ?? false,
      status: EventStatus.fromString(json['status'] as String),
      coverImageUrl: json['coverImageUrl'] as String?,
      lat: (json['lat'] as num?)?.toDouble(),
      lng: (json['lng'] as num?)?.toDouble(),
      distanceKm: (json['distanceKm'] as num?)?.toDouble(),
      studioId: json['studioId'] as String?,
      organizerUserId: json['organizerUserId'] as String,
      organizerFullName: organizer?['fullName'] as String?,
      organizerAvatarUrl: organizer?['avatarUrl'] as String?,
      studioBusinessName: studio?['businessName'] as String?,
      studioAvatarUrl: studio?['user']?['avatarUrl'] as String?,
      attendeeCount: (json['attendeeCount'] as num?)?.toInt() ?? 0,
      attendees: attendeesRaw
          .map((e) =>
              EventAttendeePreview.fromJson(e as Map<String, dynamic>))
          .toList(),
    );
  }

  String get displayOrganizer =>
      studioBusinessName ?? organizerFullName ?? 'Organizer';
}
