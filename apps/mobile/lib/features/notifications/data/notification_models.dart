import 'package:flutter/material.dart';

class AppNotification {
  const AppNotification({
    required this.id,
    required this.type,
    required this.title,
    required this.body,
    this.data,
    required this.isRead,
    required this.createdAt,
  });

  final String id;
  final String type;
  final String title;
  final String body;
  final Map<String, dynamic>? data;
  final bool isRead;
  final String createdAt;

  factory AppNotification.fromJson(Map<String, dynamic> json) {
    final dataJson = json['data'];
    return AppNotification(
      id: json['id'] as String,
      type: json['type'] as String? ?? 'GENERIC',
      title: json['title'] as String? ?? '',
      body: json['body'] as String? ?? '',
      data: dataJson is Map ? Map<String, dynamic>.from(dataJson) : null,
      isRead: json['isRead'] as bool? ?? json['is_read'] as bool? ?? false,
      createdAt: json['createdAt']?.toString() ?? json['created_at']?.toString() ?? '',
    );
  }

  IconData get iconData => _iconForType(type);

  IconData _iconForType(String t) {
    return switch (t) {
      'BOOKING' => Icons.calendar_today_rounded,
      'PARTNERSHIP_SIGNED' => Icons.gavel_rounded,
      'LEVEL_UP' => Icons.emoji_events_rounded,
      'RENTAL' || 'rental_dispute' => Icons.chair_rounded,
      'EVENT' => Icons.event_rounded,
      'dispute_created' || 'dispute_resolved' => Icons.warning_rounded,
      _ => Icons.notifications_rounded,
    };
  }
}
