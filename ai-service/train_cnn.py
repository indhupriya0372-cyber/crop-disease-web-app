"""Train the real CNN model for AgriCare AI (First Review milestone).

Expects the Kaggle "New Plant Diseases Dataset" folder structure:

    dataset/
      train/<ClassName>/<images...>
      valid/<ClassName>/<images...>

Run:
    pip install -r requirements.txt          # uncomment tensorflow/keras
    python train_cnn.py --data dataset --epochs 10

Outputs:
    model/crop_cnn.keras     -> saved model (Keras 3 format)
    model/class_names.txt    -> class labels in the same order

You can train on the generated sample set without downloading anything:

    python generate_samples.py --per-class 20 --dataset dataset
    python train_cnn.py --data dataset --epochs 5

The Flask backend (predictor.py) automatically loads the saved model and
switches from the demo heuristic to real CNN inference.
"""

import argparse
from pathlib import Path

import numpy as np
import tensorflow as tf
from keras import Sequential, layers
from keras.utils import image_dataset_from_directory

DEFAULT_DATA = Path(__file__).parent / "dataset"
MODEL_DIR = Path(__file__).parent / "model"


def build_model(num_classes, weights="imagenet"):
    base = tf.keras.applications.MobileNetV2(
        input_shape=(224, 224, 3),
        include_top=False,
        weights=weights,
    )
    base.trainable = False

    model = Sequential(
        [
            base,
            layers.GlobalAveragePooling2D(),
            layers.Dropout(0.2),
            layers.Dense(num_classes, activation="softmax"),
        ]
    )
    model.compile(
        optimizer=tf.keras.optimizers.Adam(learning_rate=1e-3),
        loss="sparse_categorical_crossentropy",
        metrics=["accuracy"],
    )
    return model


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--data", type=Path, default=DEFAULT_DATA)
    parser.add_argument("--batch", type=int, default=32)
    parser.add_argument("--epochs", type=int, default=10)
    parser.add_argument("--weights", default="imagenet",
                        help="'imagenet' for transfer learning, 'none' to train from scratch offline")
    args = parser.parse_args()

    train_ds = image_dataset_from_directory(
        args.data / "train",
        image_size=(224, 224),
        batch_size=args.batch,
        label_mode="categorical",
    )
    valid_ds = image_dataset_from_directory(
        args.data / "valid",
        image_size=(224, 224),
        batch_size=args.batch,
        label_mode="categorical",
    )

    class_names = list(train_ds.class_names)
    print("Classes (%d): %s" % (len(class_names), class_names))

    model = build_model(len(class_names), weights=args.weights)
    model.summary()

    model.fit(
        train_ds,
        validation_data=valid_ds,
        epochs=args.epochs,
    )

    MODEL_DIR.mkdir(exist_ok=True)
    model_path = MODEL_DIR / "crop_cnn.keras"
    model.save(model_path)
    (MODEL_DIR / "class_names.txt").write_text(
        "\n".join(class_names), encoding="utf-8"
    )

    loss, acc = model.evaluate(valid_ds, verbose=0)
    print("Validation accuracy: %.2f%%" % (acc * 100))
    print("Saved model -> %s" % model_path)
    print("Saved classes -> %s" % (MODEL_DIR / "class_names.txt"))


if __name__ == "__main__":
    np.set_printoptions(precision=2)
    main()