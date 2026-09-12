from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0002_user_pin_hash'),
    ]

    operations = [
        migrations.AddField(
            model_name='user',
            name='security_question',
            field=models.CharField(blank=True, max_length=255),
        ),
        migrations.AddField(
            model_name='user',
            name='security_answer_hash',
            field=models.CharField(blank=True, max_length=128),
        ),
    ]
