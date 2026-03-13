import 'package:flutter/material.dart';
import 'package:tapr/shared/widgets/placeholder_screen.dart';

class EventDetailScreen extends StatelessWidget {
  const EventDetailScreen({super.key, required this.eventId});

  final String eventId;

  @override
  Widget build(BuildContext context) {
    return PlaceholderScreen(title: 'Event: $eventId');
  }
}
